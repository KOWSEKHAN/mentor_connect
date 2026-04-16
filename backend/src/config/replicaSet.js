import mongoose from 'mongoose';

let cachedReplica = null;

/**
 * True when connected to a replica set or sharded cluster (transactions supported).
 */
export async function isReplicaSet() {
  if (cachedReplica !== null) return cachedReplica;
  try {
    const admin = mongoose.connection.db.admin();
    const info = await admin.command({ hello: 1 });
    cachedReplica = Boolean(info.setName);
  } catch {
    cachedReplica = false;
  }
  return cachedReplica;
}

export function transactionsMandatory() {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.REQUIRE_MONGODB_TRANSACTIONS === 'true'
  );
}

/**
 * Call after mongoose.connect. In production (or when REQUIRE_MONGODB_TRANSACTIONS=true),
 * exits the process if the deployment is not replica-set backed.
 */
export async function assertTransactionsAvailable() {
  if (!transactionsMandatory()) return;
  const ok = await isReplicaSet();
  if (!ok) {
    const msg =
      'MongoDB replica set (or mongos) is required: multi-document transactions are mandatory in this environment. Set REQUIRE_MONGODB_TRANSACTIONS=false for local standalone dev only.';
    console.error(msg);
    throw new Error(msg);
  }
}
