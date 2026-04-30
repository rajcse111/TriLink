const { query }         = require('../config/database');
const { success, badRequest, notFound } = require('../utils/response');
const { getDescendants, getAncestors, getDirectChildren,
        getTeamCounts, getTreeView, getLevelGenealogy,
        getTeamByDirection }            = require('../services/referral.service');
const { validate, paginationSchema }   = require('../utils/validators');

// ── Direct Sponsor (DS) ────────────────────────────────────────────

async function getDirectSponsor(req, res) {
  const result = await query(
    `SELECT u.id, u.associate_id, u.full_name, u.mobile, u.designation,
            u.current_stage, u.is_active, u.registration_date,
            u.position, u.profile_image_url
     FROM users u
     JOIN users child ON child.sponsor_id = u.id
     WHERE child.id = $1`,
    [req.user.id]
  );
  if (!result.rowCount) return success(res, null, 'No sponsor found (root user)');
  return success(res, result.rows[0]);
}

// ── All team list ──────────────────────────────────────────────────

async function getAllTeamList(req, res) {
  const { error: valErr, value } = validate(paginationSchema, req.query);
  if (valErr) return badRequest(res, 'Invalid query params', valErr);

  const { page, limit, search } = value;
  const offset = (page - 1) * limit;

  let baseFilter = `WHERE tc.ancestor_id = $1 AND tc.depth > 0`;
  const params   = [req.user.id];

  if (search) {
    baseFilter += ` AND (u.full_name ILIKE $${params.length + 1} OR u.associate_id ILIKE $${params.length + 1} OR u.mobile LIKE $${params.length + 1})`;
    params.push(`%${search}%`);
  }

  const countResult = await query(
    `SELECT COUNT(DISTINCT tc.descendant_id) FROM tree_closure tc JOIN users u ON u.id = tc.descendant_id ${baseFilter}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const data = await query(
    `SELECT u.id, u.associate_id, u.full_name, u.mobile, u.is_active,
            u.position, u.current_stage, u.designation, u.registration_date, u.activation_date,
            tc.depth AS level, s.full_name AS sponsor_name, s.associate_id AS sponsor_associate_id
     FROM tree_closure tc
     JOIN users u ON u.id = tc.descendant_id
     JOIN users s ON s.id = u.sponsor_id
     ${baseFilter}
     ORDER BY tc.depth, u.registration_date
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return res.json({
    success: true,
    message: 'Team list retrieved',
    data:    data.rows,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
}

// ── Team by direction ──────────────────────────────────────────────

async function getLeftTeam(req, res) {
  const { error: valErr, value } = validate(paginationSchema, req.query);
  if (valErr) return badRequest(res, 'Invalid query', valErr);
  const data = await getTeamByDirection(req.user.id, 'left');
  return success(res, data);
}

async function getMiddleTeam(req, res) {
  const data = await getTeamByDirection(req.user.id, 'middle');
  return success(res, data);
}

async function getRightTeam(req, res) {
  const data = await getTeamByDirection(req.user.id, 'right');
  return success(res, data);
}

// ── Active / Inactive teams ────────────────────────────────────────

async function getActiveTeam(req, res) {
  const { error: valErr, value } = validate(paginationSchema, req.query);
  if (valErr) return badRequest(res, 'Invalid query', valErr);
  const { page, limit } = value;

  const data = await getDescendants(req.user.id, { activeOnly: true, limit, offset: (page - 1) * limit });
  return success(res, data);
}

async function getInactiveTeam(req, res) {
  const { error: valErr, value } = validate(paginationSchema, req.query);
  if (valErr) return badRequest(res, 'Invalid query', valErr);
  const { page, limit } = value;

  const offset = (page - 1) * limit;
  const result = await query(
    `SELECT u.id, u.associate_id, u.full_name, u.mobile, u.is_active,
            u.position, u.current_stage, u.registration_date, tc.depth AS level
     FROM tree_closure tc
     JOIN users u ON u.id = tc.descendant_id
     WHERE tc.ancestor_id = $1 AND tc.depth > 0 AND u.is_active = FALSE
     ORDER BY tc.depth, u.registration_date
     LIMIT $2 OFFSET $3`,
    [req.user.id, limit, offset]
  );
  return success(res, result.rows);
}

// ── Tree View (TV) ─────────────────────────────────────────────────

async function getTreeViewData(req, res) {
  const targetUserId = req.query.associate_id
    ? await resolveAssociateId(req.query.associate_id)
    : req.user.id;

  if (!targetUserId) return notFound(res, 'Associate not found');

  const maxDepth = parseInt(req.query.depth || '4', 10);
  if (maxDepth > 8) return badRequest(res, 'Max depth is 8 levels');

  // Verify the requested user is in the requesting user's network
  if (targetUserId !== req.user.id) {
    const inNetwork = await query(
      `SELECT 1 FROM tree_closure WHERE ancestor_id = $1 AND descendant_id = $2`,
      [req.user.id, targetUserId]
    );
    if (!inNetwork.rowCount) return badRequest(res, 'Associate not in your network');
  }

  const treeData = await getTreeView(targetUserId, maxDepth);

  // Counts summary
  const counts = await getTeamCounts(targetUserId);

  return success(res, { tree: treeData, counts });
}

// ── Level Genealogy (LG) ───────────────────────────────────────────

async function getLevelGenealogyData(req, res) {
  const data = await getLevelGenealogy(req.user.id);
  return success(res, data);
}

// ── Helper: resolve associate_id to user id ────────────────────────

async function resolveAssociateId(associateId) {
  const result = await query(
    `SELECT id FROM users WHERE associate_id = $1`,
    [associateId]
  );
  return result.rows[0]?.id || null;
}

module.exports = {
  getDirectSponsor,
  getAllTeamList,
  getLeftTeam,
  getMiddleTeam,
  getRightTeam,
  getActiveTeam,
  getInactiveTeam,
  getTreeViewData,
  getLevelGenealogyData,
};
