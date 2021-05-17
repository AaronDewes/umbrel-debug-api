import crypto from 'crypto';
import {Db, MongoClient} from 'mongodb';
import {VercelRequest, VercelResponse} from '@vercel/node';
import * as Sentry from '@sentry/node';
// eslint-disable-next-line no-unused-vars
import * as Tracing from '@sentry/tracing';

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

Sentry.init({
	dsn: 'https://0e85586f5fbd4b50b1ee688a714deb63@o574469.ingest.sentry.io/5768424',
	// Set tracesSampleRate to 1.0 to capture 100%
	// of transactions for performance monitoring.
	// We recommend adjusting this value in production
	tracesSampleRate: 1.0
});

let transaction;

if (cachedDb) {
	transaction = Sentry.startTransaction({
		op: 'cached-read',
		name: 'Read Entry (Cached DB connection)'
	});
} else {
	transaction = Sentry.startTransaction({
		op: 'read',
		name: 'Read Entry'
	});
}

interface ParsedLogs {
	main: string;
	dmesg: string;
	apps: string;
}
/**
 * Splits the content into multiple sections for displaying
 */
function parseContent(content: string): ParsedLogs {
	const parsed: ParsedLogs = {main: '', dmesg: '', apps: ''};
	const contentSplitAtDmesg = content.split('dmesg\n-----');
	const contentSplitAtAppLogs = contentSplitAtDmesg[0].split('App logs\n--------');
	if (!contentSplitAtDmesg[1]) {
		return {
			main: contentSplitAtAppLogs[0],
			dmesg: '',
			apps: contentSplitAtAppLogs[1] ? contentSplitAtAppLogs[0].trim() : 'This upload has been using an outdated Umbrel version, so app logs aren\'t available.'
		};
	}

	parsed.dmesg = contentSplitAtDmesg[1].trim();

	if (contentSplitAtAppLogs[1]) {
		const result = contentSplitAtAppLogs[1].split('================\n==== Result ====\n================');
		parsed.main = contentSplitAtAppLogs[0].trim() + '\n\n================\n==== Result ====\n================' + result[1];
		parsed.apps = result[0];
	} else {
		parsed.main = contentSplitAtAppLogs[0].trim();
		parsed.apps = 'This upload has been using an outdated Umbrel version, so app logs aren\'t available.';
	}

	return parsed;
}

const handle = async (req: VercelRequest, res: VercelResponse) => {
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
			dmesg: '',
			apps: ''
		};
	}

	const db : Db = await connectToDatabase(process.env.MONGODB_URI);
	// Don't keep logs longer than two days
	db.collection('uploads').createIndex({createdAt: 1}, {expireAfterSeconds: 60 * 60 * 24 * 2});
	await db.collection('uploads').insertOne({...contents, key, createdAt: new Date()});
	res.status(200).json({key});
};

export default async (req: VercelRequest, res: VercelResponse) => {
	setTimeout(() => {
		try {
			handle(req, res);
		} catch (e) {
			Sentry.captureException(e);
		} finally {
			transaction.finish();
		}
	}, 99);
};
