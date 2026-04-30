/**
 * Referral Tree Service
 * =====================
 * Uses the Closure Table pattern for efficient ancestor/descendant queries.
 *
 * STRICT RULES:
 *  - Each user can have EXACTLY 3 direct referrals (left, middle, right)
 *  - Positions are left/middle/right (fixed branches)
 *  - Auto-placement uses BFS to find next available slot
 */

const { query, getClient }     = require('../config/database');
const { cacheGet, cacheSet, cacheDel, cacheDelPattern } = require('../config/redis');
const { generateReferralCode } = require('../utils/crypto');
const logger                   = require('../utils/logger');

const POSITIONS = ['left', 'middle', 'right'];

// ── Core: Add user to tree ─────────────────────────────────────────

/**
 * Place a new user in the referral tree under a given sponsor.
 * Validates the position is free; if the requested position is taken
 * and auto-place is enabled, finds the next available BFS slot.
 *
 * @param {object} client  - DB client (within a transaction)
 * @param {string} userId  - New user's ID
 * @param {string} sponsorId - Direct sponsor's user ID
 * @param {string} position  - 'left' | 'middle' | 'right'
 * @param {boolean} autoPlace - Whether to auto-place if position taken
 * @returns {object} { actualSponsorId, actualPosition }
 */
async function placeUserInTree(client, userId, sponsorId, position, autoPlace = true) {
  // 1. Validate the requested position under the sponsor
  const taken = await isPositionTaken(client, sponsorId, position);

  let actualSponsorId = sponsorId;
  let actualPosition  = position;

  if (taken) {
    if (!autoPlace) {
      throw new Error(`Position '${position}' is already taken under this sponsor`);
    }
    // BFS to find next available slot
    const slot = await findNextAvailableSlot(client, sponsorId);
    if (!slot) {
      throw new Error('No available slots in this network. Contact admin.');
    }
    actualSponsorId = slot.sponsorId;
    actualPosition  = slot.position;
    logger.info('Auto-placed user', { userId, originalSponsor: sponsorId, actualSponsorId, actualPosition });
  }

  // 2. Insert closure entries: new user is a descendant of all its ancestors
  //    plus a self-reference entry
  await client.query(
    `INSERT INTO tree_closure (ancestor_id, descendant_id, depth)
     SELECT tc.ancestor_id, $1::uuid, tc.depth + 1
     FROM tree_closure tc
     WHERE tc.descendant_id = $2::uuid
     UNION ALL
     SELECT $1::uuid, $1::uuid, 0`,
    [userId, actualSponsorId]
  );

  // 3. Update the user's sponsor_id and position
  await client.query(
    `UPDATE users SET sponsor_id = $1, position = $2 WHERE id = $3`,
    [actualSponsorId, actualPosition, userId]
  );

  // Invalidate tree cache for all ancestors
  await invalidateAncestorCache(actualSponsorId);

  return { actualSponsorId, actualPosition };
}

// ── Position & Slot helpers ────────────────────────────────────────

async function isPositionTaken(client, parentId, position) {
  const res = await client.query(
    `SELECT 1 FROM users WHERE sponsor_id = $1 AND position = $2 LIMIT 1`,
    [parentId, position]
  );
  return res.rowCount > 0;
}

/**
 * BFS search for the nearest available position slot starting from root.
 * Returns { sponsorId, position } or null if tree is full.
 */
async function findNextAvailableSlot(client, startUserId) {
  const queue  = [startUserId];
  const visited = new Set();

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    // Get current node's direct children positions
    const childRes = await client.query(
      `SELECT id, position FROM users WHERE sponsor_id = $1 ORDER BY position`,
      [currentId]
    );

    const takenPositions = new Set(childRes.rows.map(r => r.position));

    // Check each position slot
    for (const pos of POSITIONS) {
      if (!takenPositions.has(pos)) {
        return { sponsorId: currentId, position: pos };
      }
    }

    // All positions taken - add children to queue for BFS
    childRes.rows.forEach(r => queue.push(r.id));
  }
  return null;
}

// ── Tree query helpers ─────────────────────────────────────────────

/**
 * Get all descendants of a user (for network view / stage checks).
 * Uses closure table for O(1) per query.
 */
async function getDescendants(userId, options = {}) {
  const { maxDepth, activeOnly = false, limit = 5000, offset = 0 } = options;

  let sql = `
    SELECT u.id, u.associate_id, u.full_name, u.mobile, u.is_active,
           u.current_stage, u.designation, u.position, u.registration_date,
           u.activation_date, u.sponsor_id,
           tc.depth,
           s.full_name AS sponsor_name, s.associate_id AS sponsor_associate_id
    FROM tree_closure tc
    JOIN users u ON u.id = tc.descendant_id
    JOIN users s ON s.id = u.sponsor_id
    WHERE tc.ancestor_id = $1 AND tc.depth > 0
  `;
  const params = [userId];

  if (activeOnly) {
    sql += ` AND u.is_active = TRUE`;
  }
  if (maxDepth) {
    sql += ` AND tc.depth <= $${params.length + 1}`;
    params.push(maxDepth);
  }
  sql += ` ORDER BY tc.depth ASC, u.registration_date ASC`;
  sql += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get ancestors (upline) of a user.
 */
async function getAncestors(userId) {
  const result = await query(
    `SELECT u.id, u.associate_id, u.full_name, u.mobile, u.position,
            u.current_stage, tc.depth
     FROM tree_closure tc
     JOIN users u ON u.id = tc.ancestor_id
     WHERE tc.descendant_id = $1 AND tc.depth > 0
     ORDER BY tc.depth ASC`,
    [userId]
  );
  return result.rows;
}

/**
 * Get direct children (3 slots) of a user.
 */
async function getDirectChildren(userId) {
  const result = await query(
    `SELECT u.id, u.associate_id, u.full_name, u.mobile, u.is_active,
            u.position, u.current_stage, u.registration_date, u.activation_date,
            u.profile_image_url
     FROM users u
     WHERE u.sponsor_id = $1
     ORDER BY CASE position WHEN 'left' THEN 1 WHEN 'middle' THEN 2 WHEN 'right' THEN 3 END`,
    [userId]
  );
  return result.rows;
}

/**
 * Get counts by position and active status for dashboard.
 */
async function getTeamCounts(userId) {
  const cacheKey = `team_counts:${userId}`;
  const cached   = await cacheGet(cacheKey);
  if (cached) return cached;

  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE tc.depth > 0)                                   AS total_network,
       COUNT(*) FILTER (WHERE u.is_active = TRUE AND tc.depth > 0)            AS total_active,
       -- Left branch
       COUNT(*) FILTER (WHERE branch.pos = 'left' AND tc.depth > 0)           AS left_total,
       COUNT(*) FILTER (WHERE branch.pos = 'left' AND u.is_active AND tc.depth > 0) AS left_active,
       -- Middle branch
       COUNT(*) FILTER (WHERE branch.pos = 'middle' AND tc.depth > 0)         AS middle_total,
       COUNT(*) FILTER (WHERE branch.pos = 'middle' AND u.is_active AND tc.depth > 0) AS middle_active,
       -- Right branch
       COUNT(*) FILTER (WHERE branch.pos = 'right' AND tc.depth > 0)          AS right_total,
       COUNT(*) FILTER (WHERE branch.pos = 'right' AND u.is_active AND tc.depth > 0) AS right_active
     FROM tree_closure tc
     JOIN users u ON u.id = tc.descendant_id
     -- Determine which branch (left/middle/right) from the root's direct children
     LEFT JOIN LATERAL (
       SELECT u2.position AS pos
       FROM tree_closure tc2
       JOIN users u2 ON u2.id = tc2.descendant_id
       WHERE tc2.ancestor_id = $1 AND tc2.depth = 1
         AND EXISTS (
           SELECT 1 FROM tree_closure tc3
           WHERE tc3.ancestor_id = tc2.descendant_id AND tc3.descendant_id = tc.descendant_id
         )
       LIMIT 1
     ) branch ON TRUE
     WHERE tc.ancestor_id = $1`,
    [userId]
  );

  const counts = result.rows[0];
  await cacheSet(cacheKey, counts, 120); // Cache for 2 minutes
  return counts;
}

/**
 * Get tree view data (hierarchical, with active/inactive status).
 * Returns up to maxDepth levels for efficient rendering.
 */
async function getTreeView(rootUserId, maxDepth = 4) {
  const cacheKey = `tree_view:${rootUserId}:${maxDepth}`;
  const cached   = await cacheGet(cacheKey);
  if (cached) return cached;

  // Fetch the root user
  const rootResult = await query(
    `SELECT id, associate_id, full_name, is_active, position, sponsor_id, current_stage
     FROM users WHERE id = $1`,
    [rootUserId]
  );
  if (!rootResult.rowCount) return null;

  const root = rootResult.rows[0];

  // Fetch all descendants up to maxDepth
  const descResult = await query(
    `SELECT u.id, u.associate_id, u.full_name, u.is_active, u.position,
            u.sponsor_id, u.current_stage, tc.depth
     FROM tree_closure tc
     JOIN users u ON u.id = tc.descendant_id
     WHERE tc.ancestor_id = $1 AND tc.depth BETWEEN 1 AND $2
     ORDER BY tc.depth, u.position`,
    [rootUserId, maxDepth]
  );

  // Build tree recursively from flat list
  const nodeMap = new Map();
  nodeMap.set(root.id, {
    ...root,
    children: { left: null, middle: null, right: null },
    depth: 0,
  });

  for (const row of descResult.rows) {
    nodeMap.set(row.id, {
      ...row,
      children: { left: null, middle: null, right: null },
    });
  }

  for (const row of descResult.rows) {
    const parent = nodeMap.get(row.sponsor_id);
    if (parent && row.position) {
      parent.children[row.position] = nodeMap.get(row.id);
    }
  }

  const tree = nodeMap.get(rootUserId);
  await cacheSet(cacheKey, tree, 60); // Cache for 1 minute
  return tree;
}

/**
 * Get level genealogy: users at each level depth.
 */
async function getLevelGenealogy(userId) {
  const result = await query(
    `SELECT tc.depth AS level,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE u.is_active) AS active,
            COUNT(*) FILTER (WHERE NOT u.is_active) AS inactive
     FROM tree_closure tc
     JOIN users u ON u.id = tc.descendant_id
     WHERE tc.ancestor_id = $1 AND tc.depth > 0
     GROUP BY tc.depth
     ORDER BY tc.depth`,
    [userId]
  );
  return result.rows;
}

/**
 * Count active descendants for stage completion check.
 */
async function countActiveDescendants(userId) {
  const result = await query(
    `SELECT COUNT(DISTINCT tc.descendant_id) AS cnt
     FROM tree_closure tc
     JOIN users u ON u.id = tc.descendant_id
     WHERE tc.ancestor_id = $1 AND tc.depth > 0 AND u.is_active = TRUE`,
    [userId]
  );
  return parseInt(result.rows[0]?.cnt || '0', 10);
}

/**
 * Get users by team direction (left/middle/right from user's perspective).
 */
async function getTeamByDirection(userId, direction) {
  if (!POSITIONS.includes(direction)) {
    throw new Error(`Invalid direction: ${direction}`);
  }

  // Find the direct child in the given direction
  const childResult = await query(
    `SELECT id FROM users WHERE sponsor_id = $1 AND position = $2`,
    [userId, direction]
  );

  if (!childResult.rowCount) return [];

  const branchRootId = childResult.rows[0].id;

  // Get all descendants of that branch root (including the branch root itself)
  const result = await query(
    `SELECT u.id, u.associate_id, u.full_name, u.mobile, u.is_active,
            u.position, u.current_stage, u.registration_date, u.activation_date,
            tc.depth + 1 AS depth
     FROM tree_closure tc
     JOIN users u ON u.id = tc.descendant_id
     WHERE tc.ancestor_id = $1::uuid
     UNION ALL
     SELECT u.id, u.associate_id, u.full_name, u.mobile, u.is_active,
            u.position, u.current_stage, u.registration_date, u.activation_date, 1 AS depth
     FROM users u WHERE u.id = $1::uuid
     ORDER BY depth, registration_date`,
    [branchRootId]
  );
  return result.rows;
}

// ── Cache invalidation ─────────────────────────────────────────────

async function invalidateAncestorCache(userId) {
  try {
    const ancestors = await query(
      `SELECT ancestor_id FROM tree_closure WHERE descendant_id = $1`,
      [userId]
    );
    for (const row of ancestors.rows) {
      await cacheDel(`team_counts:${row.ancestor_id}`);
      await cacheDel(`tree_view:${row.ancestor_id}:4`);
    }
  } catch (err) {
    logger.warn('Cache invalidation error', { error: err.message });
  }
}

// ── Validate referral code ─────────────────────────────────────────

async function validateReferralCode(referralCode) {
  const result = await query(
    `SELECT id, associate_id, full_name, is_active, current_stage,
            (SELECT COUNT(*) FROM users WHERE sponsor_id = u.id) AS child_count
     FROM users u
     WHERE referral_code = $1`,
    [referralCode.toUpperCase()]
  );

  if (!result.rowCount) {
    return { valid: false, error: 'Invalid referral code' };
  }

  const sponsor = result.rows[0];

  if (!sponsor.is_active) {
    return { valid: false, error: 'Sponsor account is not active' };
  }

  return { valid: true, sponsor };
}

module.exports = {
  placeUserInTree,
  isPositionTaken,
  findNextAvailableSlot,
  getDescendants,
  getAncestors,
  getDirectChildren,
  getTeamCounts,
  getTreeView,
  getLevelGenealogy,
  countActiveDescendants,
  getTeamByDirection,
  validateReferralCode,
  invalidateAncestorCache,
};
