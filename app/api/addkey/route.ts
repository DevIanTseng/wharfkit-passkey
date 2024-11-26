import { Chains, PrivateKey, Session } from "@wharfkit/session";
import { NextRequest, NextResponse } from "next/server";
import { WalletPluginPrivateKey } from "@wharfkit/wallet-plugin-privatekey";

export const revalidate = 0;

const privateKey = process.env.PRIVATE_KEY || "";

export const POST = async (req: NextRequest) => {
  const data: { pubkey: string } = await req.json();

  if (!data.pubkey) {
    return NextResponse.json({ error: "No pubkey provided" }, { status: 400 });
  }

  const session = new Session({
    chain: Chains.Jungle4,
    actor: "elenawitheos",
    permission: "owner",
    walletPlugin: new WalletPluginPrivateKey(PrivateKey.fromString(privateKey)),
  });

  try {
    const account = await session.client.v1.chain.get_account(session.actor);
    const activePermission = account.permissions.find(
      (p) => p.perm_name.toString() === "active"
    );

    if (!activePermission) {
      return NextResponse.json(
        { error: "No active permission found" },
        { status: 400 }
      );
    }

    const newKeys = [
      ...activePermission.required_auth.keys,
      {
        key: data.pubkey,
        weight: 1,
      },
    ];

    const result = await session.transact({
      actions: [
        {
          account: "eosio",
          name: "updateauth",
          authorization: [
            {
              actor: session.actor,
              permission: "owner",
            },
          ],
          data: {
            account: session.actor.toString(),
            permission: "active",
            parent: "owner",
            auth: {
              threshold: activePermission.required_auth.threshold,
              keys: newKeys,
              accounts: activePermission.required_auth.accounts,
              waits: activePermission.required_auth.waits,
            },
          },
        },
      ],
    });

    if (result.response) {
      return NextResponse.json({
        transaction_id: result.response.transaction_id,
      });
    } else {
      return NextResponse.json({ error: "Error adding key" }, { status: 500 });
    }
  } catch (error) {
    console.log(error);
    return NextResponse.json({ error: "Error adding key" }, { status: 500 });
  }
};
