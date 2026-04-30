const Joi = require('joi');

const mobile = Joi.string().pattern(/^[6-9]\d{9}$/).messages({
  'string.pattern.base': 'Mobile number must be a valid 10-digit Indian mobile number',
});

const email = Joi.string().email().lowercase().trim();

const password = Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).messages({
  'string.min':          'Password must be at least 8 characters',
  'string.pattern.base': 'Password must contain uppercase, lowercase, and a digit',
});

const uuid = Joi.string().uuid({ version: 'uuidv4' });

// ── Auth schemas ───────────────────────────────────────────────────

const registerSchema = Joi.object({
  full_name:           Joi.string().trim().min(2).max(100).required(),
  father_husband_name: Joi.string().trim().max(100).optional().allow(''),
  date_of_birth:       Joi.date().iso().max('now').optional(),
  gender:              Joi.string().valid('male', 'female', 'transgender').optional(),
  marital_status:      Joi.string().valid('single', 'married', 'divorced', 'widowed').optional(),
  mobile:              mobile.required(),
  email:               email.optional().allow('', null),
  password:            password.required(),
  transaction_password: Joi.string().min(6).required(),
  referral_code:       Joi.string().trim().uppercase().required(),
  position:            Joi.string().valid('left', 'middle', 'right').required(),
  address:             Joi.string().max(500).optional().allow(''),
  state:               Joi.string().max(50).optional().allow(''),
  district:            Joi.string().max(50).optional().allow(''),
  terms_accepted:      Joi.boolean().valid(true).required()
                          .messages({ 'any.only': 'You must accept the terms and conditions' }),
});

const loginWithPasswordSchema = Joi.object({
  identifier: Joi.alternatives().try(mobile, email).required()
                 .messages({ 'alternatives.match': 'Provide a valid mobile or email' }),
  password:   Joi.string().required(),
});

const loginWithOTPSchema = Joi.object({
  mobile: mobile.required(),
});

const verifyOTPSchema = Joi.object({
  mobile:  mobile.required(),
  otp:     Joi.string().length(6).pattern(/^\d{6}$/).required(),
  purpose: Joi.string().valid('login', 'registration', 'withdrawal', 'password_reset', 'transaction')
               .default('login'),
});

const changePasswordSchema = Joi.object({
  current_password: Joi.string().required(),
  new_password:     password.required(),
});

const forgotPasswordSchema = Joi.object({
  mobile: mobile.required(),
});

const resetPasswordSchema = Joi.object({
  mobile:       mobile.required(),
  otp:          Joi.string().length(6).pattern(/^\d{6}$/).required(),
  new_password: password.required(),
});

const changeTxnPasswordSchema = Joi.object({
  current_txn_password: Joi.string().required(),
  new_txn_password:     Joi.string().min(6).required(),
  otp:                  Joi.string().length(6).pattern(/^\d{6}$/).required(),
});

// ── User profile schemas ───────────────────────────────────────────

const updateProfileSchema = Joi.object({
  full_name:           Joi.string().trim().min(2).max(100),
  father_husband_name: Joi.string().trim().max(100).allow(''),
  date_of_birth:       Joi.date().iso().max('now'),
  gender:              Joi.string().valid('male', 'female', 'transgender'),
  marital_status:      Joi.string().valid('single', 'married', 'divorced', 'widowed'),
  email:               email.allow('', null),
  address:             Joi.string().max(500).allow(''),
  state:               Joi.string().max(50).allow(''),
  district:            Joi.string().max(50).allow(''),
}).min(1);

const bankDetailSchema = Joi.object({
  account_holder_name: Joi.string().trim().max(100).required(),
  account_number:      Joi.string().trim().max(30).required(),
  ifsc_code:           Joi.string().trim().uppercase().pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/).required()
                          .messages({ 'string.pattern.base': 'Invalid IFSC code format' }),
  bank_name:           Joi.string().trim().max(100).required(),
  branch_name:         Joi.string().trim().max(100).optional().allow(''),
  is_primary:          Joi.boolean().default(false),
});

// ── Wallet / Withdrawal ────────────────────────────────────────────

const activationSchema = Joi.object({
  user_id:              uuid.optional(),  // admin activating another user
  transaction_password: Joi.string().required(),
  payment_type:         Joi.string().valid('online', 'offline').default('offline'),
  payment_reference:    Joi.string().optional().allow(''),
});

const withdrawalSchema = Joi.object({
  amount:               Joi.number().positive().min(100).required()
                           .messages({ 'number.min': 'Minimum withdrawal amount is ₹100' }),
  bank_detail_id:       uuid.required(),
  transaction_password: Joi.string().required(),
});

// ── Meeting schema ─────────────────────────────────────────────────

const meetingSchema = Joi.object({
  meeting_date:   Joi.date().iso().required(),
  meeting_time:   Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
  meeting_type:   Joi.string().max(50).required(),
  contact_person: Joi.string().max(100).optional().allow(''),
  mobile_no:      Joi.string().max(15).optional().allow(''),
  email:          email.optional().allow('', null),
  venue:          Joi.string().max(300).optional().allow(''),
  city:           Joi.string().max(50).optional().allow(''),
  state:          Joi.string().max(50).optional().allow(''),
  description:    Joi.string().max(1000).optional().allow(''),
});

// ── Complaint schema ───────────────────────────────────────────────

const complaintSchema = Joi.object({
  subject: Joi.string().trim().max(200).required(),
  message: Joi.string().trim().max(2000).required(),
  type:    Joi.string().valid('complaint', 'suggestion', 'query').default('complaint'),
});

// ── Pagination ─────────────────────────────────────────────────────

const paginationSchema = Joi.object({
  page:   Joi.number().integer().min(1).default(1),
  limit:  Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().max(100).optional().allow(''),
  sort:   Joi.string().max(50).optional(),
  order:  Joi.string().valid('asc', 'desc').default('desc'),
});

// ── Validate helper ────────────────────────────────────────────────

function validate(schema, data, options = {}) {
  const { error: err, value } = schema.validate(data, {
    abortEarly:   false,
    stripUnknown: true,
    ...options,
  });
  if (err) {
    const messages = err.details.map(d => d.message);
    return { error: messages, value: null };
  }
  return { error: null, value };
}

module.exports = {
  validate,
  registerSchema, loginWithPasswordSchema, loginWithOTPSchema,
  verifyOTPSchema, changePasswordSchema, changeTxnPasswordSchema,
  forgotPasswordSchema, resetPasswordSchema,
  updateProfileSchema, bankDetailSchema,
  activationSchema, withdrawalSchema,
  meetingSchema, complaintSchema, paginationSchema,
};
