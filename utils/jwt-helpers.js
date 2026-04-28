import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

function jwtToken(user_id, user_name) {
    const user = { id: user_id, username: user_name };
    const Accesstoken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET || 'secret', { expiresIn: '15m' });

    // jti (JWT ID) is a unique identifier for this specific refresh token.
    // We store it in Redis so we can invalidate individual tokens without blacklisting the full string.
    const jti = randomUUID();
    const refreshToken = jwt.sign({ ...user, jti }, process.env.REFRESH_TOKEN_SECRET || 'refresh_secret', { expiresIn: '7d' });

    return { Accesstoken, refreshToken, jti };
}

export default { jwtToken };
