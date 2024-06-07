import { PrismaClient } from '@prisma/client';
import chalk from 'chalk';

let prisma;

/**
 * Initializes and returns an instance of PrismaClient.
 *
 * @returns {PrismaClient|null} - Returns an instance of PrismaClient if initialization is successful, otherwise returns null.
 */
try {
	prisma = new PrismaClient();
} catch(e) {
	console.log(chalk.white.bgRed('⚠️💎 Prisma does not exist. Please initialize it first if you want to use it.'));
	prisma = null;
}

// Export the Prisma client
export default prisma;