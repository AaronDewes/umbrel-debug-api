import {Db, MongoClient} from 'mongodb';
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
	res.setHeader('Access-Control-Allow-Origin', 'https://v3.debug.umbrel.tech');

	const key: string = crypto.randomBytes(64).toString('hex');

	let contents: ParsedLogs;

	if (typeof req.body === 'string') {
		contents = parseContent(req.body);
	} else if (req.body.main && req.body.dmesg && req.body.apps) {
		contents = {main: req.body.main, dmesg: req.body.dmesg, apps: req.body.apps};
	} else {
		contents = {
			main: JSON.stringify(req.body),
			dmesg: ''
		};
	}

	const db : Db = await connectToDatabase(process.env.MONGODB_URI);
	// Don't keep logs longer than two days
	db.collection('uploads').createIndex({createdAt: 1}, {expireAfterSeconds: 60 * 60 * 24 * 2});
	await db.collection('uploads').insertOne({...contents, key, createdAt: new Date()});
	res.status(200).json({logKey: key});
};
