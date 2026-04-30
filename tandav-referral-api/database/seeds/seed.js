require('dotenv').config();
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // -------------------------------------------------------
    // 1. Super Admin
    // -------------------------------------------------------
    const adminPwd = await bcrypt.hash('Admin@123456', 12);
    await client.query(`
      INSERT INTO admins (id, username, email, password_hash, role)
      VALUES ($1, 'superadmin', 'admin@trilink.com', $2, 'super_admin')
      ON CONFLICT (username) DO NOTHING
    `, [uuidv4(), adminPwd]);

    // -------------------------------------------------------
    // 2. Root User (the genesis node - no sponsor)
    // -------------------------------------------------------
    const rootId      = uuidv4();
    const rootPwd     = await bcrypt.hash('Root@123456', 12);
    const rootTxnPwd  = await bcrypt.hash('Txn@123456', 12);
    const rootRefCode = 'TLKROOT001';

    const existingRoot = await client.query('SELECT id FROM users WHERE referral_code = $1', [rootRefCode]);
    if (existingRoot.rowCount === 0) {
      await client.query(`
        INSERT INTO users (
          id, associate_id, referral_code, full_name, mobile, email,
          password_hash, transaction_password_hash,
          current_stage, is_active, designation, terms_accepted, registration_date, activation_date
        ) VALUES ($1, 'TLK0000001', $2, 'Root Administrator', '9000000000', 'root@trilink.com',
                  $3, $4, 1, TRUE, 'Founder', TRUE, NOW(), NOW())
      `, [rootId, rootRefCode, rootPwd, rootTxnPwd]);

      // Root wallet
      await client.query(`
        INSERT INTO wallets (user_id, balance, total_earned)
        VALUES ($1, 0, 0)
      `, [rootId]);

      // Self-referencing closure entry
      await client.query(`
        INSERT INTO tree_closure (ancestor_id, descendant_id, depth)
        VALUES ($1, $1, 0)
      `, [rootId]);

      console.log('✅ Root user created.');
      console.log('   Associate ID : TLK0000001');
      console.log('   Referral Code:', rootRefCode);
      console.log('   Mobile       : 9000000000');
      console.log('   Password     : Root@123456');
      console.log('   Txn Password : Txn@123456');
    } else {
      console.log('ℹ️  Root user already exists, skipping.');
    }

    await client.query('COMMIT');
    console.log('✅ Seed completed.');
    console.log('\n📌 Default Admin Credentials:');
    console.log('   URL     : POST /api/admin/auth/login');
    console.log('   Email   : admin@trilink.com');
    console.log('   Password: Admin@123456');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
