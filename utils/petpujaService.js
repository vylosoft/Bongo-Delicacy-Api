const axios = require('axios');

const petpujaService = async (URI, requestBody) => {
  try {
    const response = await axios.post(URI, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'app-key': process.env.APP_KEY,
        'app-secret': process.env.APP_SECRET,
        'access-token': process.env.ACCESS_TOKEN
      }
    });
    return response.data;
  } catch (error) {
    throw error;
  }

}

module.exports = { petpujaService };
