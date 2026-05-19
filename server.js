require("./api/cron/resetExpiredStock");
const app = require('./app');
const env = require('./config/env');

app.get("/", (req, res)=>{
    res.send("Bongo delicacy v1.0.10");
})
app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`);
});
