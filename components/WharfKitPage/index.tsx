"use client";

import SessionKit, { Chains, Session } from "@wharfkit/session";
import { useMemo, useState } from "react";
import { WebRenderer } from "@wharfkit/web-renderer";
import { WebAuthnWallet } from "@/lib/wallet/passkey-wallet";
import { arrayToHex } from "@/lib/utils";
import { decodeKey } from "@/lib/utils/passkey";
import axios from "axios";

export const WharfKitPage = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [message, setMessage] = useState<string>("");

  const sessionKit = useMemo(() => {
    return new SessionKit({
      appName: "passkey-wallet",
      chains: [Chains.Jungle4],
      ui: new WebRenderer(),
      walletPlugins: [new WebAuthnWallet()],
    });
  }, []);

  const login = async () => {
    const { session } = await sessionKit.login();
    setSession(session);
  };

  const signTransaction = async () => {
    if (!session) return;

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
        setMessage(`transaction_id: ${result.response.transaction_id}`);
      }
    } catch (error) {
      console.log(error);
    }
  };

  const generatePasskey = async () => {
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const rpId = "vercel.app";
    // const rpId = "localhost";

    const credential = (await navigator.credentials.create({
      publicKey: {
        rp: {
          name: "passkey-wallet",
          id: rpId,
        },
        user: {
          id: new Uint8Array(16),
          name: "passkey-wallet",
          displayName: "Passkey Wallet",
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
      rpid: rpId,
      id,
      attestationObject,
    });

    localStorage.setItem(
      "passkey",
      JSON.stringify({
        id,
        pubkey: result.key,
      })
    );

    try {
      const res = await axios.post<{
        transaction_id: string;
      }>("/api/addkey", {
        pubkey: result.key,
      });

      setMessage(`transaction_id: ${res.data.transaction_id}`);
    } catch (error) {
      console.log(error);
    }
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
      </div>
      {message && <div>{message}</div>}
    </main>
  );
};
