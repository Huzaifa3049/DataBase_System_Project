import Redis from 'ioredis';

const redisconnection = new Redis({
    host: '127.0.0.1',
    port: 6379,
    maxRetriesPerRequest: null,
})


export default redisconnection;

