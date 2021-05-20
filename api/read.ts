import {Db, MongoClient} from 'mongodb';
import {VercelRequest, VercelResponse} from '@vercel/node';
import * as Sentry from '@sentry/node';

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

const handle = async (req: VercelRequest, res: VercelResponse) => {
	res.setHeader('Access-Control-Allow-Origin', 'https://v3.debug.umbrel.tech');
	if (!req.body.key) {
		res.status(400).send({});
	}

	const db: Db = await connectToDatabase(process.env.MONGODB_URI);
	const data = await db.collection('uploads').findOne({key: req.body.key});
	res.status(200).json(data);
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
