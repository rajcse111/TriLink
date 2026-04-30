const { query }          = require('../config/database');
const { validate, meetingSchema, paginationSchema } = require('../utils/validators');
const { success, badRequest, notFound }             = require('../utils/response');

async function getMeetings(req, res) {
  const { error: valErr, value } = validate(paginationSchema, req.query);
  if (valErr) return badRequest(res, 'Invalid query', valErr);

  const { page, limit } = value;
  const offset = (page - 1) * limit;

  const [data, cnt] = await Promise.all([
    query(
      `SELECT id, meeting_date, meeting_time, meeting_type, contact_person,
              mobile_no, email, venue, city, state, description, created_at
       FROM meetings
       WHERE is_active = TRUE AND meeting_date >= CURRENT_DATE
       ORDER BY meeting_date ASC, meeting_time ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query(`SELECT COUNT(*) FROM meetings WHERE is_active = TRUE AND meeting_date >= CURRENT_DATE`),
  ]);

  return res.json({
    success: true,
    data: data.rows,
    pagination: { total: parseInt(cnt.rows[0].count, 10), page, limit },
  });
}

async function getMeetingById(req, res) {
  const result = await query(
    `SELECT * FROM meetings WHERE id = $1 AND is_active = TRUE`,
    [req.params.id]
  );
  if (!result.rowCount) return notFound(res, 'Meeting not found');
  return success(res, result.rows[0]);
}

module.exports = { getMeetings, getMeetingById };
