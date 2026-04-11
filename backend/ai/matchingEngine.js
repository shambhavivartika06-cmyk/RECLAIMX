// backend/ai/matchingEngine.js
// ──────────────────────────────────────────────────────────────
// Hybrid AI matching engine
// Weights: 40% text (TF-IDF) + 30% image + 20% location + 10% time
// Threshold: 55% minimum for a match
// ──────────────────────────────────────────────────────────────

const supabase = require('../config/supabase');

const MATCH_THRESHOLD = 55;

const STOP_WORDS = new Set([
  'a','an','the','is','it','in','on','at','to','for','of','and','or','but',
  'my','i','was','been','have','has','had','lost','found','item','thing','some'
]);

// ── Text scoring (TF-IDF simplified) ──────────────────────────
function tokenize(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function computeTextScore(lost, found) {
  const lostTokens  = tokenize(`${lost.item_name} ${lost.description || ''}`);
  const foundTokens = tokenize(`${found.item_name} ${found.description || ''}`);
  if (!lostTokens.length || !foundTokens.length) return 0;
  const lostSet  = new Set(lostTokens);
  const foundSet = new Set(foundTokens);
  const intersection = [...lostSet].filter(w => foundSet.has(w));
  const union = new Set([...lostSet, ...foundSet]);
  return Math.round((intersection.length / union.size) * 100);
}

// ── Location scoring ───────────────────────────────────────────
function computeLocationScore(lost, found) {
  const lostLoc  = tokenize(lost.last_seen_location || '');
  const foundLoc = tokenize(found.found_location    || '');
  if (!lostLoc.length || !foundLoc.length) return 50; // neutral if no location data
  const lostSet = new Set(lostLoc);
  const overlap = foundLoc.filter(w => lostSet.has(w)).length;
  return Math.round((overlap / Math.max(lostLoc.length, foundLoc.length)) * 100);
}

// ── Time decay scoring ─────────────────────────────────────────
function computeTimeScore(lost, found) {
  const diffHours = Math.abs(new Date(lost.created_at) - new Date(found.created_at)) / 3600000;
  if (diffHours < 2)   return 100;
  if (diffHours < 6)   return 85;
  if (diffHours < 24)  return 70;
  if (diffHours < 72)  return 50;
  if (diffHours < 168) return 30;
  return 10;
}

// ── Image scoring (placeholder — MobileNet in production) ──────
function computeImageScore(lost, found) {
  // Production: compare MobileNet embeddings stored on Cloudinary
  // For now return 65 if both have images, 40 if not
  const hasImages = (lost.image_urls?.length > 0) && found.image_url;
  return hasImages ? 65 : 40;
}

// ── Main matching function ─────────────────────────────────────
function computeMatch(lost, found) {
  // Must be same campus and same category to even consider a match
  if (lost.campus_id !== found.campus_id) return { score: 0, isMatch: false };
  if (lost.category  !== found.category)  return { score: 0, isMatch: false };

  const textScore     = computeTextScore(lost, found);
  const imageScore    = computeImageScore(lost, found);
  const locationScore = computeLocationScore(lost, found);
  const timeScore     = computeTimeScore(lost, found);

  // Weighted formula: 40% text + 30% image + 20% location + 10% time
  const finalScore = Math.round(
    textScore     * 0.40 +
    imageScore    * 0.30 +
    locationScore * 0.20 +
    timeScore     * 0.10
  );

  return {
    score: finalScore,
    isMatch: finalScore >= MATCH_THRESHOLD,
    breakdown: { textScore, imageScore, locationScore, timeScore }
  };
}

// ── Run matching after new item submitted ──────────────────────
async function runMatching(newLostItem, newFoundItem) {
  try {
    if (newLostItem) {
      // New lost report — check against all open found items on same campus + category
      const { data: foundItems } = await supabase
        .from('found_items')
        .select('*')
        .eq('campus_id', newLostItem.campus_id)
        .eq('category',  newLostItem.category)
        .eq('status',    'Found');

      const newClaims = [];
      for (const found of (foundItems || [])) {
        const { score, isMatch } = computeMatch(newLostItem, found);
        if (isMatch) {
          newClaims.push({
            lost_item_id:  newLostItem.id,
            found_item_id: found.id,
            claimant_id:   newLostItem.user_id,
            match_score:   score,
          });
          console.log(`[Match] "${newLostItem.item_name}" ↔ "${found.item_name}" — ${score}%`);
        }
      }
      if (newClaims.length > 0) await supabase.from('claims').insert(newClaims);
    }

    if (newFoundItem) {
      // New found item — check against all open lost reports on same campus + category
      const { data: lostItems } = await supabase
        .from('lost_items')
        .select('*')
        .eq('campus_id', newFoundItem.campus_id)
        .eq('category',  newFoundItem.category)
        .eq('status',    'Lost');

      const newClaims = [];
      for (const lost of (lostItems || [])) {
        const { score, isMatch } = computeMatch(lost, newFoundItem);
        if (isMatch) {
          newClaims.push({
            lost_item_id:  lost.id,
            found_item_id: newFoundItem.id,
            claimant_id:   lost.user_id,
            match_score:   score,
          });
          console.log(`[Match] "${lost.item_name}" ↔ "${newFoundItem.item_name}" — ${score}%`);
        }
      }
      if (newClaims.length > 0) await supabase.from('claims').insert(newClaims);
    }
  } catch (err) {
    console.error('[Matching Engine Error]', err.message);
  }
}

module.exports = { runMatching, computeMatch };