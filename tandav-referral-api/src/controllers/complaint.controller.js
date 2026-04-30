const { query }          = require('../config/database');
const { validate, complaintSchema, paginationSchema } = require('../utils/validators');
const { success, created, badRequest, notFound }       = require('../utils/response');

async function createComplaint(req, res) {
  const { error: valErr, value } = validate(complaintSchema, req.body);
  if (valErr) return badRequest(res, 'Validation failed', valErr);

  const result = await query(
    `INSERT INTO complaints (user_id, subject, message, type)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [req.user.id, value.subject, value.message, value.type]
  );
  return created(res, { id: result.rows[0].id }, `${value.type} submitted successfully`);
}

async function getComplaints(req, res) {
  const { error: valErr, value } = validate(paginationSchema, req.query);
  if (valErr) return badRequest(res, 'Invalid query', valErr);

  const { page, limit } = value;
  const offset = (page - 1) * limit;

  const [data, cnt] = await Promise.all([
    query(
      `SELECT id, subject, message, type, status, admin_response, created_at, resolved_at
       FROM complaints WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    ),
    query(`SELECT COUNT(*) FROM complaints WHERE user_id = $1`, [req.user.id]),
  ]);

  return res.json({
    success: true,
    data: data.rows,
    pagination: { total: parseInt(cnt.rows[0].count, 10), page, limit },
  });
}

async function getComplaintById(req, res) {
  const result = await query(
    `SELECT * FROM complaints WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!result.rowCount) return notFound(res, 'Complaint not found');
  return success(res, result.rows[0]);
}

module.exports = { createComplaint, getComplaints, getComplaintById };
