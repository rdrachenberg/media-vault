import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI environment variable is not set");
}

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

// Cache the connection in development to survive hot reloads
// In production, this runs once per cold start
const globalWithMongo = global as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

if (process.env.NODE_ENV === "development") {
  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(MONGODB_URI);
    globalWithMongo._mongoClientPromise = client.connect();
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  client = new MongoClient(MONGODB_URI);
  clientPromise = client.connect();
}

export default clientPromise;

export async function getDb(dbName = "media-vault") {
  const client = await clientPromise;
  return client.db(dbName);
}

export async function getCollection(collectionName = "library") {
  const db = await getDb();
  return db.collection(collectionName);
}
