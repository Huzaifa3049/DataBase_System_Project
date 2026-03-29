import jwt from 'jsonwebtoken';



function authenticateToken(req, res, next) {
    const token = req.cookies.accessToken || (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET || 'secret', (err, user) => {                 
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    } );    
    
}

export default authenticateToken;