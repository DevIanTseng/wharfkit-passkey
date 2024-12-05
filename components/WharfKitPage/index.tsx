"use client";

import SessionKit, { Chains, PrivateKey, Session } from "@wharfkit/session";
import { useEffect, useMemo, useState } from "react";
import { WebRenderer } from "@wharfkit/web-renderer";
import { WebAuthnWallet } from "@/lib/wallet/passkey-wallet";
import { arrayToHex, hexToUint8Array, sortPubKeys } from "@/lib/utils";
import { decodeKey } from "@/lib/utils/passkey";
import { PASSKEY_RP_ID } from "@/lib/const";
import { WalletPluginPrivateKey } from "@wharfkit/wallet-plugin-privatekey";

export const WharfKitPage = () => {
  // user account name
  const [accountName, setAccountName] = useState<string>("");

  useEffect(() => {
    localStorage.setItem("account", accountName);
  }, [accountName]);

  // user session after login
  const [session, setSession] = useState<Session | null>(null);

  // generated passkey pubkey
  const [generatedPasskeyPubkey, setGeneratedPasskeyPubkey] =
    useState<string>("");

  // k1 private key used for appending new WA pubkey
  const [inputK1PrivateKey, setInputK1PrivateKey] = useState<string>("");

  // k1 private key generated to user for recovery
  const [generatedK1RecoveryKey, setGeneratedK1RecoveryKey] =
    useState<string>("");

  // current used passkey pubkey
  const [currentUsedPasskeyPubkey, setCurrentUsedPasskeyPubkey] =
    useState<string>("");

  // passkey wallet session kit
  const sessionKit = useMemo(() => {
    return new SessionKit({
      appName: "passkey-wallet",
      chains: [Chains.Jungle4],
      ui: new WebRenderer(),
      walletPlugins: [new WebAuthnWallet()],
    });
  }, []);

  // hardcoded private key session for testing
  const privateKeySession = useMemo(() => {
    return new Session({
      chain: Chains.Jungle4,
      actor: "jungle4alpha",
      permission: "owner",
      walletPlugin: new WalletPluginPrivateKey(
        PrivateKey.fromString(
          "5K9wrr6ajxCWb8nu31R5beJLTzxbtpo2bZfCbpnjwWkLSgvDt2D"
        )
      ),
    });
  }, []);

  const createAccount = async () => {
    if (!generatedPasskeyPubkey) {
      throw new Error("WA pubkey is needed when creating account");
    }

    // use hardcoded private key session to create a WA account
    const result = await privateKeySession.transact({
      actions: [
        {
          account: "eosio",
          name: "newaccount",
          authorization: [
            {
              actor: privateKeySession.actor,
              permission: "owner",
            },
          ],
          data: {
            creator: privateKeySession.actor.toString(),
            name: accountName,
            owner: {
              threshold: 1,
              keys: [{ key: generatedPasskeyPubkey, weight: 1 }], // set WA pubkey as owner key
              accounts: [],
              waits: [],
            },
            active: {
              threshold: 1,
              keys: [{ key: generatedPasskeyPubkey, weight: 1 }], // set WA pubkey as active key
              accounts: [],
              waits: [],
            },
          },
        },
        {
          account: "eosio",
          name: "buyrambytes",
          authorization: [
            {
              actor: privateKeySession.actor,
              permission: "owner",
            },
          ],
          data: {
            payer: privateKeySession.actor.toString(),
            receiver: accountName,
            bytes: 8192,
          },
        },
        {
          account: "eosio",
          name: "delegatebw",
          authorization: [
            {
              actor: privateKeySession.actor,
              permission: "owner",
            },
          ],
          data: {
            from: privateKeySession.actor.toString(),
            receiver: accountName,
            stake_net_quantity: "10.0000 EOS",
            stake_cpu_quantity: "10.0000 EOS",
            transfer: false,
          },
        },
        {
          account: "eosio.token",
          name: "transfer",
          authorization: [
            {
              actor: privateKeySession.actor,
              permission: "owner",
            },
          ],
          data: {
            from: privateKeySession.actor.toString(),
            to: accountName,
            quantity: "10.0000 EOS",
            memo: "Initial account funding",
          },
        },
      ],
    });

    if (result.response) {
      console.log(
        `create account transaction id: ${result.response.transaction_id}`
      );
    }
  };

  const login = async () => {
    // use passkey wallet session kit to login
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

      // random get passkey credential from user device
      const credential = (await navigator.credentials.get({
        publicKey: {
          rpId: PASSKEY_RP_ID,
          userVerification: "required",
          challenge,
          timeout: 60000,
          allowCredentials: passkeysArray.map((passkey) => ({
            type: "public-key",
            id: hexToUint8Array(passkey.id),
          })),
        },
        mediation: "required",
      })) as PublicKeyCredential;

      if (!credential) {
        throw new Error("No credential in user device");
      }

      // use credential id to get WA pubkey
      const credentialId = arrayToHex(new Uint8Array(credential.rawId));

      const matchedPasskey = passkeysArray.find(
        (passkey) => passkey.id === credentialId
      );

      if (!matchedPasskey) {
        throw new Error("No matched passkey found");
      }
      localStorage.setItem("current-passkey", JSON.stringify(matchedPasskey));

      setCurrentUsedPasskeyPubkey(matchedPasskey.pubkey);

      console.log("current used passkey credential id:", matchedPasskey.id);
      console.log("current used passkey pubkey:", matchedPasskey.pubkey);
    } catch (error) {
      console.error("Error getting credentials:", error);
      throw error;
    }

    setSession(session);
  };

  const signTransaction = async () => {
    if (!session) {
      throw new Error("User not logged in");
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
              to: "jungle4alpha",
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

    setGeneratedPasskeyPubkey(result.key);
  };

  // using when user has changed device
  const appendNewPasskeyPubkey = async () => {
    if (!generatedPasskeyPubkey || !inputK1PrivateKey) {
      throw new Error("New WA pubkey and K1 private key are needed");
    }

    // use K1 private key to create session
    const session = new Session({
      chain: Chains.Jungle4,
      actor: accountName, // please check account name
      permission: "owner",
      walletPlugin: new WalletPluginPrivateKey(
        PrivateKey.fromString(inputK1PrivateKey)
      ),
    });

    const account = await session.client.v1.chain.get_account(session.actor);

    // get active and owner permission
    const activePermission = account.permissions.find(
      (p) => p.perm_name.toString() === "active"
    );
    const ownerPermission = account.permissions.find(
      (p) => p.perm_name.toString() === "owner"
    );

    if (!activePermission || !ownerPermission) {
      throw new Error("Permission lost");
    }

    // get active and owner pubkeys
    const activePubkeys = activePermission.required_auth.keys.map((k) => ({
      key: k.key.toString(),
      weight: k.weight.toNumber(),
    }));

    const ownerPubkeys = ownerPermission.required_auth.keys.map((k) => ({
      key: k.key.toString(),
      weight: k.weight.toNumber(),
    }));

    // append new WA pubkey to active and owner pubkeys
    activePubkeys.push({
      key: generatedPasskeyPubkey,
      weight: 1,
    });

    ownerPubkeys.push({
      key: generatedPasskeyPubkey,
      weight: 1,
    });

    // sort pubkeys
    const sortedActivePubkeys = sortPubKeys(activePubkeys);
    const sortedOwnerPubkeys = sortPubKeys(ownerPubkeys);

    // update active and owner permission
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
            permission: "owner",
            parent: "",
            auth: {
              threshold: 1,
              keys: sortedOwnerPubkeys,
              accounts: ownerPermission.required_auth.accounts,
              waits: ownerPermission.required_auth.waits,
            },
          },
        },
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
              threshold: 1,
              keys: sortedActivePubkeys,
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

  // using when user exporting k1 private recovery key
  const appendK1Pubkey = async () => {
    if (!generatedK1RecoveryKey) {
      throw new Error("K1 recovery key is needed");
    }

    // get k1 pubkey from recovery key
    const k1Pubkey = PrivateKey.fromString(generatedK1RecoveryKey)
      .toPublic()
      .toString();

    // check user is logged in
    if (!session) {
      throw new Error("User not logged in");
    }

    // get active and owner permission
    const account = await session.client.v1.chain.get_account(session.actor);

    const activePermission = account.permissions.find(
      (p) => p.perm_name.toString() === "active"
    );
    const ownerPermission = account.permissions.find(
      (p) => p.perm_name.toString() === "owner"
    );

    if (!activePermission || !ownerPermission) {
      throw new Error("Permission lost");
    }

    // get active and owner WA pubkeys
    const activeWAPubkeys = activePermission.required_auth.keys
      .filter((k) => k.key.type === "WA")
      .map((k) => ({
        key: k.key.toString(),
        weight: k.weight.toNumber(),
      }));

    const ownerWAPubkeys = ownerPermission.required_auth.keys
      .filter((k) => k.key.type === "WA")
      .map((k) => ({
        key: k.key.toString(),
        weight: k.weight.toNumber(),
      }));

    // keep WA pubkeys and append k1 pubkey
    const activePubkeys = [...activeWAPubkeys, { key: k1Pubkey, weight: 1 }];
    const ownerPubkeys = [...ownerWAPubkeys, { key: k1Pubkey, weight: 1 }];

    // sort pubkeys
    const sortedActivePubkeys = sortPubKeys(activePubkeys);
    const sortedOwnerPubkeys = sortPubKeys(ownerPubkeys);

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
            permission: "owner",
            parent: "",
            auth: {
              threshold: 1,
              keys: sortedOwnerPubkeys,
              accounts: ownerPermission.required_auth.accounts,
              waits: ownerPermission.required_auth.waits,
            },
          },
        },
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
              threshold: 1,
              keys: sortedActivePubkeys,
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

  const generateK1 = async () => {
    const k1 = PrivateKey.generate("K1");

    console.log("recovery key:", k1.toString());
    setGeneratedK1RecoveryKey(k1.toString());
  };

  return (
    <main className="w-full mx-auto max-w-screen-xl min-h-screen flex flex-col space-y-24 items-center justify-center">
      <div className="flex flex-col space-y-4 items-center">
        <button
          className="border border-slate-400 rounded-md bg-blue-400 text-white hover:opacity-80 transition-opacity px-4 py-2 text-sm font-medium"
          onClick={() => generatePasskey()}
        >
          Generate Passkey
        </button>
        {generatedPasskeyPubkey && (
          <div>
            Generated passkey pubkey:{" "}
            <span className="text-orange-600">{generatedPasskeyPubkey}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col space-y-4 items-center">
        <div className="flex items-center space-x-4">
          <div>Account</div>
          <input
            className="border px-3 py-2 rounded-md bg-slate-100 border-slate-300"
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
          />
          <button
            className="border border-slate-400 rounded-md bg-blue-400 text-white hover:opacity-80 transition-opacity px-4 py-2 text-sm font-medium"
            onClick={() => createAccount()}
          >
            Create Account
          </button>
        </div>
        <div className="flex items-center space-x-4">
          <div>K1 Private Key</div>
          <input
            className="border px-3 py-2 rounded-md bg-slate-100 border-slate-300"
            type="text"
            value={inputK1PrivateKey}
            onChange={(e) => setInputK1PrivateKey(e.target.value)}
          />
          <button
            className="border border-slate-400 rounded-md bg-blue-400 text-white hover:opacity-80 transition-opacity px-4 py-2 text-sm font-medium"
            onClick={() => appendNewPasskeyPubkey()}
          >
            Append New WA Pubkey
          </button>
        </div>
      </div>

      <div className="flex flex-col space-y-4 items-center">
        <div className="flex items-center space-x-4">
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
        {currentUsedPasskeyPubkey && (
          <div>
            Current used passkey pubkey:{" "}
            <span className="text-orange-600">{currentUsedPasskeyPubkey}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center space-y-4">
        <div className="flex items-center space-x-4">
          <button
            className="border border-slate-400 rounded-md bg-blue-400 text-white hover:opacity-80 transition-opacity px-4 py-2 text-sm font-medium"
            onClick={() => generateK1()}
          >
            Generate K1 Recovery Key
          </button>
          <button
            className="border border-slate-400 rounded-md bg-blue-400 text-white hover:opacity-80 transition-opacity px-4 py-2 text-sm font-medium"
            onClick={() => appendK1Pubkey()}
          >
            Append K1 Pubkey
          </button>
        </div>
        {generatedK1RecoveryKey && (
          <div>
            K1 Recovery Key:{" "}
            <span className="text-orange-600">{generatedK1RecoveryKey}</span>
          </div>
        )}
      </div>
    </main>
  );
};
