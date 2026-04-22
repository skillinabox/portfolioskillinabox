// src/lib/subscription.js
// Credit-based usage: garments_used + poses_used (poses = all AI images incl try-ons)

import { supabase } from './supabase'

export function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}

export async function getActiveSubscription(learnerId) {
  const { data } = await supabase
    .from('subscriptions')
    .select('*, subscription_plans(*)')
    .eq('learner_id', learnerId)
    .eq('status', 'active')
    .gte('end_date', new Date().toISOString())
    .order('end_date', { ascending: false })
    .limit(1).maybeSingle()
  return data
}

export async function getPlans() {
  const { data } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('display_order')
  return data || []
}

export async function getUsage(learnerId) {
  const month = currentMonth()
  const { data } = await supabase
    .from('usage').select('*')
    .eq('learner_id', learnerId)
    .eq('month', month)
    .maybeSingle()
  return data || { garments_used:0, poses_used:0 }
}

export async function incrementUsage(learnerId, type, count = 1) {
  const month = currentMonth()
  const field = type === 'garments' ? 'garments_used' : 'poses_used'
  const { data: existing } = await supabase
    .from('usage').select('*')
    .eq('learner_id', learnerId).eq('month', month).maybeSingle()

  if (existing) {
    await supabase.from('usage').update({
      [field]: (existing[field] || 0) + count,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id)
  } else {
    await supabase.from('usage').insert({ learner_id: learnerId, month, [field]: count })
  }
}

export async function canPerform(learnerId, action) {
  const { data: learner } = await supabase
    .from('learners').select('subscription_status, subscription_end')
    .eq('id', learnerId).single()
  if (!learner) return { allowed: false, reason: 'Not found' }

  const isActive = ['active','trial'].includes(learner.subscription_status) &&
    learner.subscription_end && new Date(learner.subscription_end) > new Date()

  if (!isActive) return { allowed: action === 'view_dashboard', reason: 'subscription_expired' }
  if (action === 'view_dashboard') return { allowed: true }

  const sub = await getActiveSubscription(learnerId)
  if (!sub) return { allowed: false, reason: 'No active subscription' }

  const plan = sub.subscription_plans
  const usage = await getUsage(learnerId)

  if (action === 'upload_garment') {
    const effectiveLimit = plan.garment_limit + (usage.garment_bonus || 0)
    if (usage.garments_used >= effectiveLimit)
      return { allowed: false, reason: 'garment_limit_reached', used: usage.garments_used, limit: effectiveLimit }
  }
  if (action === 'generate_pose') {
    const effectiveLimit = plan.pose_limit + (usage.pose_bonus || 0)
    if (usage.poses_used >= effectiveLimit)
      return { allowed: false, reason: 'pose_limit_reached', used: usage.poses_used, limit: effectiveLimit }
  }
  return { allowed: true }
}

export async function grantFreeTrial(learnerId, planId) {
  const endDate = new Date()
  endDate.setMonth(endDate.getMonth() + 1)
  await supabase.from('subscriptions').insert({
    learner_id: learnerId, plan_id: planId, status: 'trial',
    start_date: new Date().toISOString(), end_date: endDate.toISOString(),
    granted_by_admin: true, amount_paid: 0,
  })
  await supabase.from('learners').update({
    subscription_status: 'trial', subscription_end: endDate.toISOString(), is_free_trial_used: true,
  }).eq('id', learnerId)
  return endDate
}

export async function checkExpiry(learnerId) {
  const { data: learner } = await supabase
    .from('learners').select('subscription_status, subscription_end').eq('id', learnerId).single()
  if (!learner) return
  const isExpired = learner.subscription_end && new Date(learner.subscription_end) < new Date() &&
    ['active','trial'].includes(learner.subscription_status)
  if (isExpired) {
    await supabase.from('learners').update({ subscription_status: 'expired' }).eq('id', learnerId)
    await supabase.from('subscriptions').update({ status: 'expired' })
      .eq('learner_id', learnerId).eq('status', learner.subscription_status)
  }
}
