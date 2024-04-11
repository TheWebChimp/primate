import { PrismaClient } from '@prisma/client';
import chalk from 'chalk';

let prisma;

try {
	prisma = new PrismaClient({});
} catch(e) {
	console.log(chalk.white.bgRed('⚠️💎 Prisma does not exist. Please initialize it first. if you want to use it.'));
	prisma = null;
}

// export the prism client
export default prisma;