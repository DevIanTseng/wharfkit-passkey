"use client";

import SessionKit, { Chains, PrivateKey, Session } from "@wharfkit/session";
import { useMemo, useState } from "react";
import { WebRenderer } from "@wharfkit/web-renderer";
import { WebAuthnWallet } from "@/lib/wallet/passkey-wallet";
import { arrayToHex, sortPubKeys } from "@/lib/utils";
import { decodeKey } from "@/lib/utils/passkey";
import { PASSKEY_RP_ID } from "@/lib/const";
import { WalletPluginPrivateKey } from "@wharfkit/wallet-plugin-privatekey";

export const WharfKitPage = () => {
  const [session, setSession] = useState<Session | null>(null);

  const sessionKit = useMemo(() => {
    return new SessionKit({
      appName: "passkey-wallet",
      chains: [Chains.Jungle4],
      ui: new WebRenderer(),
      walletPlugins: [new WebAuthnWallet()],
    });
  }, []);

  const privateKeySession = useMemo(() => {
    return new Session({
      chain: Chains.Jungle4,
      actor: "elenawitheos",
      permission: "owner",
      walletPlugin: new WalletPluginPrivateKey(
        PrivateKey.fromString(
          "5K9wrr6ajxCWb8nu31R5beJLTzxbtpo2bZfCbpnjwWkLSgvDt2D"
        )
      ),
    });
  }, []);

  const changeWAPermission = async (pubkey: string) => {
    if (!privateKeySession) {
      throw new Error("Private key session not initialized");
    }

    const account = await privateKeySession.client.v1.chain.get_account(
      privateKeySession.actor
    );
    const activePermission = account.permissions.find(
      (p) => p.perm_name.toString() === "active"
    );

    if (!activePermission) {
      throw new Error("No active permission found");
    }

    const pubkeys = activePermission.required_auth.keys.map((k) => ({
      key: k.key.toString(),
      weight: k.weight.toNumber(),
    }));

    pubkeys.push({
      key: pubkey,
      weight: 1,
    });

    const sortedPubkeys = sortPubKeys(pubkeys);

    console.log("sorted pubkeys:", sortedPubkeys);

    const result = await privateKeySession.transact({
      actions: [
        {
          account: "eosio",
          name: "updateauth",
          authorization: [
            {
              actor: privateKeySession.actor,
              permission: "owner",
            },
          ],
          data: {
            account: privateKeySession.actor.toString(),
            permission: "active",
            parent: "owner",
            auth: {
              threshold: 1,
              keys: sortedPubkeys,
              accounts: activePermission.required_auth.accounts,
              waits: activePermission.required_auth.waits,
            },
          },
        },
      ],
    });

    if (result.response) {
      console.log(
        `change permission transaction id: ${result.response.transaction_id}`
      );
    }
  };

  const changeK1Permission = async (pubkey: string) => {};

  const resetPermission = async () => {
    if (!privateKeySession) {
      throw new Error("Private key session not initialized");
    }

    const result = await privateKeySession.transact({
      actions: [
        {
          account: "eosio",
          name: "updateauth",
          authorization: [
            {
              actor: privateKeySession.actor,
              permission: "owner",
            },
          ],
          data: {
            account: privateKeySession.actor.toString(),
            permission: "active",
            parent: "owner",
            auth: {
              threshold: 1,
              keys: [
                {
                  key: "EOS68gVr5f4Gbny8TbDQ68ioGNNRabh6FeRfMAuSDFKgY7944gbUS",
                  weight: 1,
                },
              ],
              accounts: [],
              waits: [],
            },
          },
        },
      ],
    });

    if (result.response) {
      console.log(
        `reset permission transaction id: ${result.response.transaction_id}`
      );
    }
  };

  const login = async () => {
    const { session } = await sessionKit.login();

    // TODO: Get passkey array from contract
    const passkeysArray = JSON.parse(
      localStorage.getItem("passkeys") || "[]"
    ) as {
      id: string;
      pubkey: string;
    }[];

    if (passkeysArray.length === 0) {
      throw new Error("No passkeys found in contract");
    }

    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));

      const credentials = (await navigator.credentials.get({
        publicKey: {
          rpId: PASSKEY_RP_ID,
          userVerification: "required",
          challenge,
          timeout: 60000,
        },
        mediation: "optional",
      })) as PublicKeyCredential;

      if (!credentials) {
        throw new Error("No credentials found");
      }

      const credentialId = arrayToHex(new Uint8Array(credentials.rawId));

      const matchedPasskey = passkeysArray.find(
        (passkey) => passkey.id === credentialId
      );

      if (!matchedPasskey) {
        throw new Error("No matched passkey found");
      }

      localStorage.setItem("current-passkey", JSON.stringify(matchedPasskey));

      console.log("current used passkey id:", matchedPasskey.id);
      console.log("current used passkey pubkey:", matchedPasskey.pubkey);
    } catch (error) {
      console.error("Error getting credentials:", error);
      throw error;
    }

    setSession(session);
  };

  const signTransaction = async () => {
    if (!session) {
      throw new Error("Session not initialized");
    }

    try {
      const result = await session.transact({
        actions: [
          {
            account: "eosio.token",
            name: "transfer",
            authorization: [
              {
                actor: session.actor.toString(),
                permission: "active",
              },
            ],
            data: {
              from: session.actor.toString(),
              to: "elenaaccount",
              quantity: "1.0000 EOS",
              memo: "test passkey transfer",
            },
          },
        ],
      });

      if (result.response) {
        console.log(
          `transfer transaction id: ${result.response.transaction_id}`
        );
      }
    } catch (error) {
      console.log(error);
    }
  };

  const generatePasskey = async () => {
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const randomId = crypto.getRandomValues(new Uint8Array(16));

    const credential = (await navigator.credentials.create({
      publicKey: {
        rp: {
          name: `passkey-wallet-${arrayToHex(randomId)}`,
          id: PASSKEY_RP_ID,
        },
        user: {
          id: randomId,
          name: `passkey-wallet-${arrayToHex(randomId)}`,
          displayName: `passkey-wallet-${arrayToHex(randomId)}`,
        },
        pubKeyCredParams: [
          {
            type: "public-key",
            alg: -7,
          },
        ],
        timeout: 60000,
        challenge,
      },
    })) as PublicKeyCredential;

    if (!credential) return;

    const id = arrayToHex(new Uint8Array(credential.rawId));

    const response = credential.response as AuthenticatorAttestationResponse;

    const attestationObject = arrayToHex(
      new Uint8Array(response.attestationObject)
    );

    const result = await decodeKey({
      rpid: PASSKEY_RP_ID,
      id,
      attestationObject,
    });

    console.log("new passkey credential id:", result.credentialId);
    console.log("new passkey pubkey:", result.key);

    // TODO: save passkey to contract
    const existingPasskeys = JSON.parse(
      localStorage.getItem("passkeys") || "[]"
    );

    existingPasskeys.push({
      id,
      pubkey: result.key,
    });

    localStorage.setItem("passkeys", JSON.stringify(existingPasskeys));

    console.log("starting change permission use pubkey:", result.key);
    await changeWAPermission(result.key);
    console.log("change permission success");
  };

  return (
    <main className="w-full mx-auto max-w-screen-xl min-h-screen flex flex-col space-y-4 items-center justify-center">
      <div className="flex items-center space-x-4">
        <button
          className="border border-slate-400 rounded-md bg-blue-400 text-white hover:opacity-80 transition-opacity px-4 py-2 text-sm font-medium"
          onClick={() => generatePasskey()}
        >
          Generate Passkey
        </button>
        <button
          className="border border-slate-400 rounded-md bg-blue-400 text-white hover:opacity-80 transition-opacity px-4 py-2 text-sm font-medium"
          onClick={() => login()}
        >
          Login
        </button>
        <button
          className="border border-slate-400 rounded-md bg-blue-400 text-white hover:opacity-80 transition-opacity px-4 py-2 text-sm font-medium"
          onClick={() => signTransaction()}
        >
          Sign Transaction
        </button>
        <button
          className="border border-slate-400 rounded-md bg-blue-400 text-white hover:opacity-80 transition-opacity px-4 py-2 text-sm font-medium"
          onClick={() => resetPermission()}
        >
          Reset Permission
        </button>
      </div>
    </main>
  );
};
