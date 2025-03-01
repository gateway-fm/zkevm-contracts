const winston = require('winston');

// Create Winston logger with console transport only
const logger = winston.createLogger({
    level: 'debug', // Set log level (error, warn, info, debug)
    format: winston.format.combine(
        winston.format.colorize(), // Adds color to console logs
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), // Adds timestamp
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`), // Custom format
    ),
    transports: [
        new winston.transports.Console(), // Logs only to the terminal
    ],
});

module.exports.logger = logger;
