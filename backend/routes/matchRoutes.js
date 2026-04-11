const express  = require('express');
const router   = express.Router();
const protect  = require('../middleware/authMiddleware');
const supabase = require('../config/supabase');
const { checkAnswers } = require('../utils/verificationEngine');

// GET /api/matches
router.get('/', protect, async (req, res) => {
  try {
    const { data: user } = await supabase.from('users').select('*').eq('firebase_uid', req.user.uid).single();
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const { data: claims } = await supabase
      .from('claims')
      .select('*, lost_items(*), found_items(*)')
      .eq('claimant_id', user.id)
      .order('created_at', { ascending: false });

    res.json(claims || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/matches/verify
router.post('/verify', protect, async (req, res) => {
  try {
    const { claimId, answers } = req.body;

    const { data: claim } = await supabase.from('claims').select('*, lost_items(*)').eq('id', claimId).single();
    const { data: user }  = await supabase.from('users').select('*').eq('firebase_uid', req.user.uid).single();

    if (!claim) return res.status(404).json({ error: 'Claim not found.' });
    if (!user)  return res.status(404).json({ error: 'User not found.' });
    if (user.is_suspended) return res.status(403).json({ error: 'Account suspended.' });

    const hiddenAttributes = {
      colorInside:  claim.lost_items.hidden_color_inside,
      uniqueMarks:  claim.lost_items.hidden_unique_marks,
      contains:     claim.lost_items.hidden_contains,
    };

    const score = checkAnswers(answers, hiddenAttributes);

    if (score >= 0.6) {
      await supabase.from('claims').update({ status: 'Verified', verification_score: score, answer_1: answers.q1, answer_2: answers.q2, answer_3: answers.q3 }).eq('id', claimId);
      await supabase.from('lost_items').update({ status: 'Pending' }).eq('id', claim.lost_item_id);
      return res.json({ success: true, passed: true, score });
    } else {
      const newFailed = (user.failed_claims || 0) + 1;
      const suspended = newFailed >= 3;
      await supabase.from('users').update({ failed_claims: newFailed, is_suspended: suspended }).eq('id', user.id);
      await supabase.from('claims').update({ status: 'Rejected', verification_score: score }).eq('id', claimId);
      return res.json({ success: false, passed: false, score, attemptsUsed: newFailed, suspended });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/matches/confirm-handover/:claimId
router.post('/confirm-handover/:claimId', protect, async (req, res) => {
  try {
    const { data: claim } = await supabase.from('claims').select('*').eq('id', req.params.claimId).single();
    const { data: user }  = await supabase.from('users').select('*').eq('firebase_uid', req.user.uid).single();
    if (!claim || !user) return res.status(404).json({ error: 'Not found.' });

    const update = claim.claimant_id === user.id
      ? { loster_confirmed: true }
      : { founder_confirmed: true };

    const { data: updated } = await supabase.from('claims').update(update).eq('id', claim.id).select().single();

    if (updated.loster_confirmed && updated.founder_confirmed) {
      await supabase.from('claims').update({ status: 'Resolved' }).eq('id', claim.id);
      await supabase.from('lost_items').update({ status: 'Resolved' }).eq('id', claim.lost_item_id);

      const newScore = (user.trust_score || 0) + 10;
      const newLevel = newScore >= 100 ? 'Gold' : newScore >= 50 ? 'Silver' : 'Bronze';
      await supabase.from('users').update({ trust_score: newScore, trust_level: newLevel }).eq('id', user.id);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/matches/dismiss/:claimId
router.post('/dismiss/:claimId', protect, async (req, res) => {
  try {
    await supabase.from('claims').delete().eq('id', req.params.claimId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;