const { createClient } = require("@supabase/supabase-js");
const env = require('./env');


const SUPABASE_URL = "https://nldgaczpzfmwamivniua.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sZGdhY3pwemZtd2FtaXZuaXVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjYyNzA5NSwiZXhwIjoyMDc4MjAzMDk1fQ.sLnOMjKs-WJu9IyAaLUzLCmKZl0-Ph32-ElUT2MbWYY";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
module.exports = supabase;

