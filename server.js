require("./api/cron/resetExpiredStock");
require("./api/cron/StoreAutoOn.cron"); // add this line
const app = require('./app');
const env = require('./config/env');

app.get("/", (req, res)=>{
    res.send("Bongo delicacy v1.0.10");
})
app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`);
});