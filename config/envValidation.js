const REQUIRED_ENVS = [
  'JWT_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'DATABASE_URL',
  'MIDTRANS_SERVER_KEY'
];

function validateEnv() {
  const missing = REQUIRED_ENVS.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.warn('⚠️  ENVIRONMENT WARNING: Missing required env vars:', missing.join(', '));
    console.warn('   Some features may not work correctly.');
  } else {
    console.log('✅ All required environment variables are set.');
  }
}

module.exports = { validateEnv };