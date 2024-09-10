const axios = require('axios');

const instance = axios.create({
    baseURL: process.env.LLM_URI,
    withCredentials: true,
});

module.exports=instance;