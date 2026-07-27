const winston = require('winston');
const logger = winston.createLogger({
  transports: [
    new winston.transports.File({ filename: '/root/forbidden/error.log' })
  ]
});
console.log('Logger created successfully.');
