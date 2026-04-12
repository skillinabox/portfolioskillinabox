// src/lib/subscription.js
// Helpers for subscription checking, usage tracking, access control

import { supabase } from './supabase'

// Get current month key e.g. '2026-04'
export function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Get active subscription for a learner
export async function getActiveSubscription(learnerId) {
  const { data } = await supabase
    .from('subscriptions')
    .select('*, subscription_plans(*)')
    .eq('learner_id', learnerId)
    .eq('status', 'active')
    .gte('end_date', new Date().toISOString())
    .order('end_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

// Get all plans
export async function getPlans() {
  const { data } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('display_order')
  return data || []
}

// Get usage for current month
export async function getUsage(learnerId) {
  const month = currentMonth()
  const { data } = await supabase
    .from('usage')
    .select('*')
    .eq('learner_id', learnerId)
    .eq('month', month)
    .maybeSingle()
  return data || { garments_used: 0, poses_used: 0 }
}

// Increment usage counter
export async function incrementUsage(learnerId, type) {
  // type: 'garments' or 'poses'
  const month = currentMonth()
  const field = type === 'garments' ? 'garments_used' : 'poses_used'

  // Try to get existing record
  const { data: existing } = await supabase
    .from('usage')
    .select('*')
    .eq('learner_id', learnerId)
    .eq('month', month)
    .maybeSingle()

  if (existing) {
    await supabase.from('usage').update({
      [field]: (existing[field] || 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id)
  } else {
    await supabase.from('usage').insert({
      learner_id: learnerId,
      month,
      [field]: 1,
    })
  }
}

// Check if learner can perform action
export async function canPerform(learnerId, action) {
  // action: 'upload_garment' | 'generate_pose' | 'view_dashboard'
  const { data: learner } = await supabase
    .from('learners')
    .select('subscription_status, subscription_end')
    .eq('id', learnerId)
    .single()

  if (!learner) return { allowed: false, reason: 'Learner not found' }

  // Check subscription active
  const isActive = ['active', 'trial'].includes(learner.subscription_status) &&
    learner.subscription_end &&
    new Date(learner.subscription_end) > new Date()

  if (!isActive) {
    return {
      allowed: action === 'view_dashboard', // can always view, just restricted
      reason: 'subscription_expired',
      subscription_status: learner.subscription_status,
    }
  }

  if (action === 'view_dashboard') return { allowed: true }

  // Check usage limits
  const sub = await getActiveSubscription(learnerId)
  if (!sub) return { allowed: false, reason: 'No active subscription found' }

  const plan = sub.subscription_plans
  const usage = await getUsage(learnerId)

  if (action === 'upload_garment') {
    const limit = plan.garment_limit
    if (limit !== -1 && usage.garments_used >= limit) {
      return { allowed: false, reason: 'garment_limit_reached', used: usage.garments_used, limit }
    }
  }

  if (action === 'generate_pose') {
    const limit = plan.pose_limit
    if (limit !== -1 && usage.poses_used >= limit) {
      return { allowed: false, reason: 'pose_limit_reached', used: usage.poses_used, limit }
    }
  }

  return { allowed: true }
}

// Grant free trial (admin only)
export async function grantFreeTrial(learnerId, planId) {
  const endDate = new Date()
  endDate.setMonth(endDate.getMonth() + 1)

  // Create subscription
  await supabase.from('subscriptions').insert({
    learner_id: learnerId,
    plan_id: planId,
    status: 'trial',
    start_date: new Date().toISOString(),
    end_date: endDate.toISOString(),
    granted_by_admin: true,
    amount_paid: 0,
  })

  // Update learner
  await supabase.from('learners').update({
    subscription_status: 'trial',
    subscription_end: endDate.toISOString(),
    is_free_trial_used: true,
  }).eq('id', learnerId)

  return endDate
}

// Check and expire subscriptions (call on load)
export async function checkExpiry(learnerId) {
  const { data: learner } = await supabase
    .from('learners')
    .select('subscription_status, subscription_end')
    .eq('id', learnerId)
    .single()

  if (!learner) return

  const isExpired = learner.subscription_end &&
    new Date(learner.subscription_end) < new Date() &&
    ['active', 'trial'].includes(learner.subscription_status)

  if (isExpired) {
    await supabase.from('learners').update({ subscription_status: 'expired' }).eq('id', learnerId)
    await supabase.from('subscriptions')
      .update({ status: 'expired' })
      .eq('learner_id', learnerId)
      .eq('status', learner.subscription_status)
  }
}
