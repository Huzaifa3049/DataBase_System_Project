import jwt from 'jsonwebtoken';

function jwtToken(user_id , user_name){
    const user = { id: user_id, username: user_name };
    const Accesstoken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET || 'secret', { expiresIn: '15m' });
    const refreshToken = jwt.sign(user, process.env.REFRESH_TOKEN_SECRET || 'refresh_secret', { expiresIn: '7d' });
    return ({ Accesstoken , refreshToken}); 

}

export default {jwtToken} ;
