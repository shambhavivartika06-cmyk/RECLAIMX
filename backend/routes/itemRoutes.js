// backend/routes/itemRoutes.js
const express   = require('express');
const router    = express.Router();
const protect   = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinary');
const supabase  = require('../config/supabase');
const { runMatching } = require('../ai/matchingEngine');
const { hasSensitiveData } = require('../utils/sensitiveDataFilter');

// GET /api/items/me — get current user's items
router.get('/me', protect, async (req, res, next) => {
  try {
    const { data: user } = await supabase.from('users').select('id').eq('firebase_uid', req.user.uid).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [lostRes, foundRes] = await Promise.all([
      supabase.from('lost_items').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('found_items').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    ]);

    res.json({ lost: lostRes.data || [], found: foundRes.data || [] });
  } catch (err) {
    next(err);
  }
});

// GET /api/items — browse items (public)
router.get('/', async (req, res, next) => {
  try {
    const { campus, category, search } = req.query;

    let lostQ  = supabase.from('lost_items').select('id,item_name,category,status,created_at,campus_id,last_seen_location').eq('status', 'Lost').limit(50);
    let foundQ = supabase.from('found_items').select('id,item_name,category,status,created_at,campus_id,found_location').eq('status', 'Found').limit(50);

    if (campus)   { lostQ = lostQ.eq('campus_id', campus);   foundQ = foundQ.eq('campus_id', campus); }
    if (category) { lostQ = lostQ.eq('category', category);  foundQ = foundQ.eq('category', category); }
    if (search)   { lostQ = lostQ.ilike('item_name', `%${search}%`); foundQ = foundQ.ilike('item_name', `%${search}%`); }

    const [{ data: lost }, { data: found }] = await Promise.all([lostQ, foundQ]);
    res.json({ lost: lost || [], found: found || [] });
  } catch (err) {
    next(err);
  }
});

// POST /api/items/lost
router.post('/lost', protect, upload.array('images', 2), async (req, res, next) => {
  try {
    const { itemName, description, category, lastSeenLocation, campusId, hiddenAttributes } = req.body;

    if (hasSensitiveData(description)) {
      return res.status(400).json({ error: 'Sensitive data detected. Please remove it.' });
    }

    const { data: user } = await supabase.from('users').select('*').eq('firebase_uid', req.user.uid).single();
    if (!user)            return res.status(404).json({ error: 'User not found.' });
    if (user.is_suspended) return res.status(403).json({ error: 'Account suspended.' });

    const hidden = JSON.parse(hiddenAttributes || '{}');
    const imageUrls = (req.files || []).map(f => f.path);

    const { data: lostItem, error } = await supabase
      .from('lost_items')
      .insert({
        user_id:             user.id,
        campus_id:           campusId,
        item_name:           itemName,
        description,
        category,
        last_seen_location:  lastSeenLocation,
        image_urls:          imageUrls,
        hidden_color_inside: hidden.colorInside  || '',
        hidden_unique_marks: hidden.uniqueMarks  || '',
        hidden_contains:     hidden.contains     || '',
      })
      .select()
      .single();

    if (error) throw error;
    runMatching(lostItem, null).catch(e => console.error('[Matching Error]', e));
    res.status(201).json({ success: true, item: lostItem });
  } catch (err) {
    next(err);
  }
});

// POST /api/items/found
router.post('/found', protect, upload.single('image'), async (req, res, next) => {
  try {
    const { itemName, description, category, foundLocation, campusId } = req.body;

    if (hasSensitiveData(description)) {
      return res.status(400).json({ error: 'Sensitive data detected. Please remove it.' });
    }

    const { data: user } = await supabase.from('users').select('*').eq('firebase_uid', req.user.uid).single();
    if (!user)            return res.status(404).json({ error: 'User not found.' });
    if (user.is_suspended) return res.status(403).json({ error: 'Account suspended.' });

    const { data: foundItem, error } = await supabase
      .from('found_items')
      .insert({
        user_id:        user.id,
        campus_id:      campusId,
        item_name:      itemName,
        description,
        category,
        found_location: foundLocation,
        image_url:      req.file ? req.file.path : '',
      })
      .select()
      .single();

    if (error) throw error;
    runMatching(null, foundItem).catch(e => console.error('[Matching Error]', e));
    res.status(201).json({ success: true, item: foundItem });
  } catch (err) {
    next(err);
  }
});

module.exports = router;