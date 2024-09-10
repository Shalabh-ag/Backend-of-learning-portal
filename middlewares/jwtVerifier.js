const jwt = require('jsonwebtoken');
const User = require('../models/User');

const verifyTokenMiddleware = async (req, res, next) => {
    const token = req.headers.token;

    try {
        if (!token) return res.status(401).json({ message: 'No token provided' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findOne({ _id: decoded.userId, 'tokens.token': token });
        if (!user) return res.status(401).json({ message: 'User not authorized (Re-login)' }); 

        if (req.headers['user-id'] && decoded.userId !== req.headers['user-id']) return res.status(401).json({ message: 'User token mismatch' });
        
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            try {
                const user = await User.findOne({ 'tokens.token': token });
                if (user) {
                    user.tokens = user.tokens.filter(t => t.token !== token);
                    await user.save();
                }
                return res.status(401).json({ message: 'Expired token (Re-login)' });
            } catch (error) {
                return res.status(500).json({ message: `Error removing expired token: ${error}` });
            }
        }
        return res.status(500).json({ message: 'Unauthorized access' });
    }
};

module.exports = { verifyTokenMiddleware };