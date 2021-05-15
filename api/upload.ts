import {MongoClient} from 'mongodb';
import crypto from 'crypto';
import {VercelRequest, VercelResponse} from '@vercel/node';

let cachedDb = null;

async function connectToDatabase(uri) {
	if (cachedDb) {
		return cachedDb;
	}

	const client = await MongoClient.connect(uri, {useNewUrlParser: true, useUnifiedTopology: true});

	const db = await client.db(new URL(uri).pathname.substr(1));
	cachedDb = db;
	return db;
}

interface ParsedLogs {
  main: string;
  dmesg: string;
  apps?: string;
}
/**
 * Splits the content into multiple sections for displaying
 */
function parseContent(content: string): ParsedLogs {
	const parsed: ParsedLogs = {main: '', dmesg: ''};
	const contentSplitAtDmesg = content.split('dmesg\n-----');
	const contentSplitAtAppLogs = contentSplitAtDmesg[0].split('App logs\n--------');
	if (!contentSplitAtDmesg[1]) {
		return {
			main: contentSplitAtAppLogs[0],
			dmesg: ''
		};
	}

	parsed.dmesg = contentSplitAtDmesg[1].trim();
	parsed.main = contentSplitAtAppLogs[0].trim();
	parsed.apps = contentSplitAtAppLogs[1] ? contentSplitAtAppLogs[1].trim() : 'No app logs found';
	return parsed;
}

export default async (req: VercelRequest, res: VercelResponse) => {
	const key: string = crypto.randomBytes(64).toString('hex');

	let contents: ParsedLogs;

	if (typeof req.body === 'string') {
		contents = parseContent(req.body);
	} else if (req.body.main && req.body.dmesg && req.body.apps) {
		contents = req.body;
	} else {
		contents = {
			main: JSON.stringify(req.body),
			dmesg: ''
		};
	}

	const db = await connectToDatabase(process.env.MONGODB_URI);
	await db.collection('uploads').insertOne({...contents, key});

	res.status(200).json({logKey: key});
};
