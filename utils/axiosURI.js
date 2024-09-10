const axios = require('./axiosConfig');

const handleResponseError = (error) => {
    if (error.response) {
        const { status, data } = error.response;
        if (status === 404) {
            throw new Error(`Status ${status}: (Not Found) Incorrect API call - ${error}`);
        } else if (data.message) {
            throw new Error(`Status ${status}: ${data.message}`);
        } else {
            throw new Error(`Status ${status}: ${data.detail}`);
        }
    } else if (error.request) {
        throw new Error(`No response received: Network Error (Couldn't connect to the server)`);
    } else {
        throw new Error(`Client error: Error setting up the request - ${error}`);
    }
};

const getAPI = async (path) => {
    try {
        const response = await axios.get(path);
        return response.data;
    } catch (error) {
        handleResponseError(error);
    }
};

const postAPI = async (path, data) => {
    try {
        const response = await axios.post(path, data);
        return response.data;
    } catch (error) {
        handleResponseError(error);
    }
};

const postAPIMedia = async (path, formData) => {
    try {
        const response = await axios.post(path, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    } catch (error) {
        handleResponseError(error);
    }
};

module.exports = { getAPI, postAPI, postAPIMedia };
