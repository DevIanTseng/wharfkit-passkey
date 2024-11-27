import {
  AbstractWalletPlugin,
  WalletPluginSignResponse,
  Signature,
  Serializer,
  TransactContext,
  ResolvedSigningRequest,
  WalletPluginMetadata,
  LoginContext,
  WalletPluginLoginResponse,
  PermissionLevel,
} from "@wharfkit/session";
import { ec } from "elliptic";
import { SerialBuffer } from "../utils/serial-buffer";
import { hexToUint8Array } from "../utils";
import {
  KeyType,
  signatureToString,
  stringToPublicKey,
} from "../utils/numeric";

export class WebAuthnWallet extends AbstractWalletPlugin {
  public id = "wallet-plugin-passkey";

  readonly metadata: WalletPluginMetadata = WalletPluginMetadata.from({
    name: "Passkey Wallet",
    description: "Sign transactions using WebAuthn/Passkey",
  });

  async login(context: LoginContext): Promise<WalletPluginLoginResponse> {
    return {
      chain: context.chains[0].id,
      permissionLevel: PermissionLevel.from({
        actor: "elenawitheos",
        permission: "active",
      }),
    };
  }

  async sign(
    resolved: ResolvedSigningRequest,
    context: TransactContext
  ): Promise<WalletPluginSignResponse> {
    const chainID = context.chain.id;
    const transaction = resolved.transaction;

    const serializedTransaction = Serializer.encode({
      object: transaction,
    }).array;

    const signBuf = new SerialBuffer();
    signBuf.pushArray(hexToUint8Array(chainID.hexString));
    signBuf.pushArray(serializedTransaction);

    // TODO: Add serializedContextFreeData
    signBuf.pushArray(new Uint8Array(32));

    const digest = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        signBuf.asUint8Array().slice().buffer
      )
    );

    const passkey = localStorage.getItem("current-passkey");

    if (!passkey) {
      throw new Error("No passkey found");
    }

    const { id, pubkey } = JSON.parse(passkey) as {
      id: string;
      pubkey: string;
    };

    const assertion = (await navigator.credentials.get({
      publicKey: {
        timeout: 60000,
        allowCredentials: [
          {
            id: hexToUint8Array(id),
            type: "public-key",
          },
        ],
        challenge: digest.buffer,
      },
    })) as PublicKeyCredential;

    if (!assertion) {
      throw new Error("No assertion found");
    }

    // https://github.com/indutny/elliptic/pull/232
    const e = new ec("p256") as any;

    const publicKey = e
      .keyFromPublic(stringToPublicKey(pubkey).data.subarray(0, 33))
      .getPublic();

    const fixup = (x: Uint8Array) => {
      const a = Array.from(x);
      while (a.length < 32) a.unshift(0);
      while (a.length > 32)
        if (a.shift() !== 0)
          throw new Error("Signature has an r or s that is too big");
      return new Uint8Array(a);
    };

    const response = assertion.response as AuthenticatorAssertionResponse;

    const der = new SerialBuffer({
      array: new Uint8Array(response.signature),
    });
    if (der.get() !== 0x30) {
      throw new Error("Signature missing DER prefix");
    }
    if (der.get() !== der.array.length - 2) {
      throw new Error("Signature has bad length");
    }
    if (der.get() !== 0x02) {
      throw new Error("Signature has bad r marker");
    }
    const r = fixup(der.getUint8Array(der.get()));
    if (der.get() !== 0x02) {
      throw new Error("Signature has bad s marker");
    }
    const s = fixup(der.getUint8Array(der.get()));

    const whatItReallySigned = new SerialBuffer();
    whatItReallySigned.pushArray(new Uint8Array(response.authenticatorData));
    whatItReallySigned.pushArray(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", response.clientDataJSON)
      )
    );
    const hash = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        whatItReallySigned.asUint8Array().slice()
      )
    );
    const recid = e.getKeyRecoveryParam(
      hash,
      new Uint8Array(response.signature),
      publicKey
    );

    const sigData = new SerialBuffer();
    sigData.push(recid + 27 + 4);
    sigData.pushArray(r);
    sigData.pushArray(s);
    sigData.pushBytes(new Uint8Array(response.authenticatorData));
    sigData.pushBytes(new Uint8Array(response.clientDataJSON));

    const sig = signatureToString({
      type: KeyType.wa,
      data: sigData.asUint8Array().slice(),
    });

    return {
      signatures: [Signature.from(sig)],
    };
  }
}
