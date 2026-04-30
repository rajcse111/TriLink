-- =============================================================
-- TRILINK REFERRAL NETWORK - Complete Database Schema
-- PostgreSQL 14+
-- =============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================
-- STAGE CONFIGURATION
-- =============================================================
CREATE TABLE IF NOT EXISTS stage_config (
    stage               INT PRIMARY KEY,
    name                VARCHAR(50) NOT NULL,
    required_members    INT NOT NULL,          -- total active members in subtree
    activation_fee      DECIMAL(15,2) NOT NULL DEFAULT 100,
    stage_bonus         DECIMAL(15,2) DEFAULT 0,
    level_income        JSONB NOT NULL DEFAULT '{}',  -- {"1":40,"2":20,"3":10}
    description         TEXT,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed stage configuration (3^1 to 3^13)
INSERT INTO stage_config (stage, name, required_members, activation_fee, stage_bonus, level_income, description) VALUES
(1,  'Stage 1',  3,       100, 100,   '{"1":40,"2":20,"3":10,"4":5,"5":2}', 'Level 1 complete: 3 direct members'),
(2,  'Stage 2',  12,      100, 300,   '{"1":40,"2":20,"3":10,"4":5,"5":2}', 'Level 2 complete: 12 total members'),
(3,  'Stage 3',  39,      100, 900,   '{"1":40,"2":20,"3":10,"4":5,"5":2}', 'Level 3 complete: 39 total members'),
(4,  'Stage 4',  120,     100, 2700,  '{"1":40,"2":20,"3":10,"4":5,"5":2}', 'Level 4 complete: 120 total members'),
(5,  'Stage 5',  363,     100, 8100,  '{"1":40,"2":20,"3":10,"4":5,"5":2}', 'Level 5 complete: 363 total members'),
(6,  'Stage 6',  1092,    100, 24300, '{"1":40,"2":20,"3":10,"4":5,"5":2}', 'Level 6 complete: 1092 total members'),
(7,  'Stage 7',  3279,    100, 72900, '{"1":40,"2":20,"3":10,"4":5,"5":2}', 'Level 7 complete'),
(8,  'Stage 8',  9840,    100, 218700,'{"1":40,"2":20,"3":10,"4":5,"5":2}', 'Level 8 complete'),
(9,  'Stage 9',  29523,   100, 656100,'{"1":40,"2":20,"3":10,"4":5,"5":2}', 'Level 9 complete'),
(10, 'Stage 10', 88572,   100, 1968300,'{"1":40,"2":20,"3":10,"4":5,"5":2}','Level 10 complete'),
(11, 'Stage 11', 265719,  100, 5904900,'{"1":40,"2":20,"3":10,"4":5,"5":2}','Level 11 complete'),
(12, 'Stage 12', 531441,  100, 17714700,'{"1":40,"2":20,"3":10,"4":5,"5":2}','Level 12 complete: 531441 members'),
(13, 'Stage 13', 797160,  100, 53144100,'{"1":40,"2":20,"3":10,"4":5,"5":2}','Final stage - Retirement')
ON CONFLICT (stage) DO NOTHING;

-- =============================================================
-- USERS
-- =============================================================
CREATE TABLE IF NOT EXISTS users (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    associate_id             VARCHAR(20) UNIQUE NOT NULL,
    referral_code            VARCHAR(20) UNIQUE NOT NULL,

    -- Sponsor / Tree Position
    sponsor_id               UUID REFERENCES users(id) ON DELETE RESTRICT,
    position                 VARCHAR(10) CHECK (position IN ('left', 'middle', 'right')),

    -- Personal Info
    full_name                VARCHAR(100) NOT NULL,
    father_husband_name      VARCHAR(100),
    date_of_birth            DATE,
    gender                   VARCHAR(20) CHECK (gender IN ('male', 'female', 'transgender')),
    marital_status           VARCHAR(20) CHECK (marital_status IN ('single', 'married', 'divorced', 'widowed')),

    -- Contact
    mobile                   VARCHAR(15) UNIQUE NOT NULL,
    email                    VARCHAR(100) UNIQUE,

    -- Authentication
    password_hash            VARCHAR(255),
    transaction_password_hash VARCHAR(255),
    token_version            INT DEFAULT 0,

    -- Profile
    profile_image_url        VARCHAR(500),
    address                  TEXT,
    state                    VARCHAR(50),
    district                 VARCHAR(50),

    -- Status & Stage
    designation              VARCHAR(50) DEFAULT 'Associate',
    current_stage            INT DEFAULT 0,         -- 0 = pending activation
    is_active                BOOLEAN DEFAULT FALSE,
    is_kyc_verified          BOOLEAN DEFAULT FALSE,
    kyc_status               VARCHAR(20) DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'submitted', 'verified', 'rejected')),
    is_retired               BOOLEAN DEFAULT FALSE,
    terms_accepted           BOOLEAN DEFAULT FALSE,

    -- Security / Fraud
    last_ip                  INET,
    device_fingerprint       VARCHAR(255),
    failed_login_attempts    INT DEFAULT 0,
    locked_until             TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    registration_date        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    activation_date          TIMESTAMP WITH TIME ZONE,
    last_upgrade_date        TIMESTAMP WITH TIME ZONE,
    last_login_at            TIMESTAMP WITH TIME ZONE,
    created_at               TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at               TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for users
CREATE INDEX IF NOT EXISTS idx_users_sponsor_id     ON users(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_users_mobile         ON users(mobile);
CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_referral_code  ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_associate_id   ON users(associate_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active      ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_current_stage  ON users(current_stage);

-- =============================================================
-- TREE CLOSURE TABLE (Efficient ancestor/descendant queries)
-- Uses the Closure Table pattern for O(1) ancestor lookups
-- =============================================================
CREATE TABLE IF NOT EXISTS tree_closure (
    ancestor_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    descendant_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    depth           INT NOT NULL DEFAULT 0,
    PRIMARY KEY (ancestor_id, descendant_id)
);

CREATE INDEX IF NOT EXISTS idx_tree_closure_ancestor   ON tree_closure(ancestor_id);
CREATE INDEX IF NOT EXISTS idx_tree_closure_descendant ON tree_closure(descendant_id);
CREATE INDEX IF NOT EXISTS idx_tree_closure_depth      ON tree_closure(depth);

-- =============================================================
-- WALLETS
-- =============================================================
CREATE TABLE IF NOT EXISTS wallets (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    balance          DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    total_earned     DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_withdrawn  DECIMAL(15,2) NOT NULL DEFAULT 0,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);

-- =============================================================
-- TRANSACTIONS (Immutable Ledger)
-- =============================================================
CREATE TABLE IF NOT EXISTS transactions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id),
    type             VARCHAR(30) NOT NULL CHECK (type IN (
                         'activation', 'level_income', 'stage_bonus',
                         'withdrawal', 'withdrawal_reversal', 'admin_credit',
                         'admin_debit', 'referral_income'
                     )),
    amount           DECIMAL(15,2) NOT NULL,
    balance_before   DECIMAL(15,2) NOT NULL DEFAULT 0,
    balance_after    DECIMAL(15,2) NOT NULL DEFAULT 0,
    description      TEXT,
    reference_id     UUID,            -- related user/transaction ID
    from_user_id     UUID REFERENCES users(id),
    stage            INT,
    level            INT,
    status           VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed','reversed')),
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id    ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type       ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_from_user  ON transactions(from_user_id);

-- =============================================================
-- INCOME RECORDS
-- =============================================================
CREATE TABLE IF NOT EXISTS income_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    from_user_id    UUID REFERENCES users(id),
    income_type     VARCHAR(30) NOT NULL CHECK (income_type IN (
                        'level_income', 'stage_bonus', 'referral_bonus', 'daily_income'
                    )),
    amount          DECIMAL(15,2) NOT NULL,
    level           INT,
    stage           INT,
    description     TEXT,
    income_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_income_user_id    ON income_records(user_id);
CREATE INDEX IF NOT EXISTS idx_income_type       ON income_records(income_type);
CREATE INDEX IF NOT EXISTS idx_income_date       ON income_records(income_date DESC);
CREATE INDEX IF NOT EXISTS idx_income_from_user  ON income_records(from_user_id);

-- =============================================================
-- BANK DETAILS
-- =============================================================
CREATE TABLE IF NOT EXISTS bank_details (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_holder_name  VARCHAR(100) NOT NULL,
    account_number       VARCHAR(30) NOT NULL,
    ifsc_code            VARCHAR(20) NOT NULL,
    bank_name            VARCHAR(100) NOT NULL,
    branch_name          VARCHAR(100),
    is_primary           BOOLEAN DEFAULT FALSE,
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_details_user_id ON bank_details(user_id);

-- =============================================================
-- WITHDRAWAL REQUESTS
-- =============================================================
CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),
    amount              DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    bank_detail_id      UUID REFERENCES bank_details(id),
    status              VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','processed','cancelled')),
    admin_note          TEXT,
    processed_by        UUID,
    transaction_id      UUID REFERENCES transactions(id),
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at        TIMESTAMP WITH TIME ZONE,
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_user_id ON withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_status  ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_created ON withdrawal_requests(created_at DESC);

-- =============================================================
-- KYC DOCUMENTS
-- =============================================================
CREATE TABLE IF NOT EXISTS kyc_documents (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type     VARCHAR(50) NOT NULL CHECK (document_type IN ('aadhar','pan','voter_id','passport','driving_license')),
    document_number   VARCHAR(50),
    front_image_url   VARCHAR(500),
    back_image_url    VARCHAR(500),
    status            VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','under_review','verified','rejected')),
    rejection_reason  TEXT,
    verified_by       UUID,
    verified_at       TIMESTAMP WITH TIME ZONE,
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kyc_user_id ON kyc_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_status  ON kyc_documents(status);

-- =============================================================
-- OTP RECORDS
-- =============================================================
CREATE TABLE IF NOT EXISTS otps (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier  VARCHAR(100) NOT NULL,  -- mobile or email
    otp_hash    VARCHAR(255) NOT NULL,
    purpose     VARCHAR(30) NOT NULL CHECK (purpose IN ('login','registration','withdrawal','password_reset','transaction')),
    is_used     BOOLEAN DEFAULT FALSE,
    attempts    INT DEFAULT 0,
    expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otps_identifier ON otps(identifier);
CREATE INDEX IF NOT EXISTS idx_otps_expires_at ON otps(expires_at);

-- =============================================================
-- NOTIFICATIONS
-- =============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        VARCHAR(50) NOT NULL CHECK (type IN (
                    'new_referral','stage_complete','promotion','earnings_credited',
                    'retirement','withdrawal_approved','withdrawal_rejected',
                    'kyc_verified','kyc_rejected','system'
                )),
    title       VARCHAR(200) NOT NULL,
    message     TEXT NOT NULL,
    is_read     BOOLEAN DEFAULT FALSE,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id  ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read  ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created  ON notifications(created_at DESC);

-- =============================================================
-- MEETINGS / SEMINARS
-- =============================================================
CREATE TABLE IF NOT EXISTS meetings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_date    DATE NOT NULL,
    meeting_time    TIME NOT NULL,
    meeting_type    VARCHAR(50) NOT NULL,
    contact_person  VARCHAR(100),
    mobile_no       VARCHAR(15),
    email           VARCHAR(100),
    venue           TEXT,
    city            VARCHAR(50),
    state           VARCHAR(50),
    description     TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetings_date      ON meetings(meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_is_active ON meetings(is_active);

-- =============================================================
-- COMPLAINTS / SUGGESTIONS
-- =============================================================
CREATE TABLE IF NOT EXISTS complaints (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    subject         VARCHAR(200) NOT NULL,
    message         TEXT NOT NULL,
    type            VARCHAR(20) NOT NULL DEFAULT 'complaint' CHECK (type IN ('complaint','suggestion','query')),
    status          VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
    admin_response  TEXT,
    resolved_by     UUID,
    resolved_at     TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_complaints_user_id ON complaints(user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status  ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_created ON complaints(created_at DESC);

-- =============================================================
-- STAGE HISTORY
-- =============================================================
CREATE TABLE IF NOT EXISTS stage_history (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id),
    from_stage       INT NOT NULL,
    to_stage         INT NOT NULL,
    nodes_count      INT,
    income_credited  DECIMAL(15,2) DEFAULT 0,
    completed_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stage_history_user_id ON stage_history(user_id);
CREATE INDEX IF NOT EXISTS idx_stage_history_to_stage ON stage_history(to_stage);

-- =============================================================
-- ADMINS
-- =============================================================
CREATE TABLE IF NOT EXISTS admins (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      VARCHAR(50) UNIQUE NOT NULL,
    email         VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20) NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','super_admin','support')),
    is_active     BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================
-- LOGIN LOGS (Fraud Detection & Audit)
-- =============================================================
CREATE TABLE IF NOT EXISTS login_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID REFERENCES users(id),
    admin_id            UUID REFERENCES admins(id),
    ip_address          INET,
    device_fingerprint  VARCHAR(255),
    user_agent          TEXT,
    action              VARCHAR(30) NOT NULL CHECK (action IN ('login','logout','failed_login','register','otp_sent','otp_verified','password_reset')),
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_logs_user_id    ON login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_ip         ON login_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_logs_created_at ON login_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_logs_action     ON login_logs(action);

-- =============================================================
-- PAYMENT ORDERS (Online Payment Gateway)
-- =============================================================
CREATE TABLE IF NOT EXISTS payment_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    order_id        VARCHAR(100) UNIQUE,      -- Gateway order ID
    payment_id      VARCHAR(100),             -- Gateway payment ID
    amount          DECIMAL(15,2) NOT NULL,
    currency        VARCHAR(5) DEFAULT 'INR',
    purpose         VARCHAR(50) NOT NULL DEFAULT 'activation',
    status          VARCHAR(20) NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid','failed','refunded')),
    gateway         VARCHAR(30) DEFAULT 'razorpay',
    gateway_data    JSONB DEFAULT '{}',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id   ON payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_order_id  ON payment_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status    ON payment_orders(status);

-- =============================================================
-- BATCH PROCESSING LOG
-- =============================================================
CREATE TABLE IF NOT EXISTS batch_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_type      VARCHAR(50) NOT NULL,  -- 'stage_validation', 'payment_calc', 'tree_update'
    total_processed INT DEFAULT 0,
    success_count   INT DEFAULT 0,
    error_count     INT DEFAULT 0,
    started_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at    TIMESTAMP WITH TIME ZONE,
    error_details   JSONB DEFAULT '[]',
    status          VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running','completed','failed'))
);

-- =============================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to relevant tables
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['users','wallets','bank_details','kyc_documents','complaints','meetings','withdrawal_requests','payment_orders','admins']
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS set_updated_at ON %I;
            CREATE TRIGGER set_updated_at
            BEFORE UPDATE ON %I
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        ', t, t);
    END LOOP;
END;
$$;

-- Function: Generate unique associate ID
CREATE OR REPLACE FUNCTION generate_associate_id()
RETURNS VARCHAR AS $$
DECLARE
    new_id VARCHAR(20);
    exists_count INT;
BEGIN
    LOOP
        new_id := 'TLK' || LPAD(FLOOR(RANDOM() * 9999999)::TEXT, 7, '0');
        SELECT COUNT(*) INTO exists_count FROM users WHERE associate_id = new_id;
        EXIT WHEN exists_count = 0;
    END LOOP;
    RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Get descendant count for stage check
CREATE OR REPLACE FUNCTION get_descendant_count(p_user_id UUID, p_active_only BOOLEAN DEFAULT TRUE)
RETURNS INT AS $$
DECLARE
    cnt INT;
BEGIN
    IF p_active_only THEN
        SELECT COUNT(DISTINCT tc.descendant_id)
        INTO cnt
        FROM tree_closure tc
        JOIN users u ON u.id = tc.descendant_id
        WHERE tc.ancestor_id = p_user_id
          AND tc.depth > 0
          AND u.is_active = TRUE;
    ELSE
        SELECT COUNT(DISTINCT tc.descendant_id)
        INTO cnt
        FROM tree_closure tc
        WHERE tc.ancestor_id = p_user_id
          AND tc.depth > 0;
    END IF;
    RETURN COALESCE(cnt, 0);
END;
$$ LANGUAGE plpgsql;

-- Function: Check if position slot is taken for a given parent
CREATE OR REPLACE FUNCTION is_position_taken(p_parent_id UUID, p_position VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    cnt INT;
BEGIN
    SELECT COUNT(*) INTO cnt
    FROM users
    WHERE sponsor_id = p_parent_id AND position = p_position;
    RETURN cnt > 0;
END;
$$ LANGUAGE plpgsql;

-- Function: Get direct children count
CREATE OR REPLACE FUNCTION get_direct_children_count(p_user_id UUID)
RETURNS INT AS $$
DECLARE
    cnt INT;
BEGIN
    SELECT COUNT(*) INTO cnt FROM users WHERE sponsor_id = p_user_id;
    RETURN COALESCE(cnt, 0);
END;
$$ LANGUAGE plpgsql;

-- View: User dashboard summary
CREATE OR REPLACE VIEW user_dashboard_view AS
SELECT
    u.id,
    u.associate_id,
    u.full_name,
    u.mobile,
    u.email,
    u.designation,
    u.current_stage,
    u.is_active,
    u.is_kyc_verified,
    u.kyc_status,
    u.is_retired,
    u.referral_code,
    u.registration_date,
    u.activation_date,
    u.last_upgrade_date,
    u.profile_image_url,
    u.state,
    u.district,

    -- Wallet info
    COALESCE(w.balance, 0)         AS wallet_balance,
    COALESCE(w.total_earned, 0)    AS total_earned,
    COALESCE(w.total_withdrawn, 0) AS total_withdrawn,

    -- Direct referral counts by position
    (SELECT COUNT(*) FROM users WHERE sponsor_id = u.id)                                           AS total_direct_members,
    (SELECT COUNT(*) FROM users WHERE sponsor_id = u.id AND position = 'left')                     AS direct_left,
    (SELECT COUNT(*) FROM users WHERE sponsor_id = u.id AND position = 'middle')                   AS direct_middle,
    (SELECT COUNT(*) FROM users WHERE sponsor_id = u.id AND position = 'right')                    AS direct_right,
    (SELECT COUNT(*) FROM users WHERE sponsor_id = u.id AND is_active = TRUE AND position = 'left')   AS active_left,
    (SELECT COUNT(*) FROM users WHERE sponsor_id = u.id AND is_active = TRUE AND position = 'middle') AS active_middle,
    (SELECT COUNT(*) FROM users WHERE sponsor_id = u.id AND is_active = TRUE AND position = 'right')  AS active_right,

    -- Total downline
    (SELECT COUNT(DISTINCT descendant_id) FROM tree_closure WHERE ancestor_id = u.id AND depth > 0) AS total_network_size,

    -- Sponsor info
    s.associate_id AS sponsor_associate_id,
    s.full_name    AS sponsor_name,
    s.mobile       AS sponsor_mobile

FROM users u
LEFT JOIN wallets w    ON w.user_id = u.id
LEFT JOIN users s      ON s.id = u.sponsor_id;
