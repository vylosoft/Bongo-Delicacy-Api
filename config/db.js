// const { Sequelize } = require('sequelize');
const { createClient } = require('@supabase/supabase-js')
const env = require('./env');

// const sequelize = new Sequelize(env.DB_URL, {
//   dialect: 'postgres',
//   logging: false,
//   pool: {
//     max: 2,
//     min: 0,
//     acquire: 30000,
//     idle: 10000
//   }
// });

// Initialize the Supabase client
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    realtime: {
        params: {
            eventsPerSecond: 10,
        },
    },
});
module.exports = supabase;
// module.exports = sequelize;
