"use client";

import SessionKit, { Chains, Session } from "@wharfkit/session";
import { useMemo, useState } from "react";
import { WebRenderer } from "@wharfkit/web-renderer";
import { WebAuthnWallet } from "@/lib/wallet/passkey-wallet";
import { arrayToHex } from "@/lib/utils";
import { decodeKey } from "@/lib/utils/passkey";
import axios from "axios";
import { PASSKEY_RP_ID } from "@/lib/const";

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

      console.log("Current passkey:", matchedPasskey);
    } catch (error) {
      console.error("Error getting credentials:", error);
      throw error;
    }

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

    // TODO: save passkey to contract
    const existingPasskeys = JSON.parse(
      localStorage.getItem("passkeys") || "[]"
    );

    existingPasskeys.push({
      id,
      pubkey: result.key,
    });

    localStorage.setItem("passkeys", JSON.stringify(existingPasskeys));

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
