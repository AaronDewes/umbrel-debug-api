import {Db, MongoClient} from 'mongodb';
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

export default async (req: VercelRequest, res: VercelResponse) => {
	if (!req.body.key) {
		res.status(400).send({});
	}

	const db: Db = await connectToDatabase(process.env.MONGODB_URI);
	await db.collection('uploads').deleteOne({key: req.body.key});
	res.status(200).send({});
};
