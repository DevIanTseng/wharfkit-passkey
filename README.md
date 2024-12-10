## Getting Started

First, run the development server:

```bash
pnpm i

pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Online demo: [https://wharfkit-passkey.vercel.app/](https://wharfkit-passkey.vercel.app/).

## Learn More

Please change `/lib/const/index.ts` if you want to test locally.

EOS passkey transaction only support `https` protocol, so you need to use SSL certificate if you want to test locally.

## How To Test

### Create account

1. open [https://wharfkit-passkey.vercel.app/](https://wharfkit-passkey.vercel.app/).
2. click `Generate Passkey` button and input your `Account`.
3. click `Create Account` button to create new account.
4. open console to see details.

### Send transaction

> Make sure `Account` input is correct, and you have passkey in your browser.

1. click `Login` button.
2. click `Sign Transaction` button.
3. open console to see details.

### Backup account

> Make sure you have already logged in.

1. click `Generate K1 Recovery Key` button.
2. save `K1 Recovery Key` to your safe place.
3. click `Append K1 Pubkey` button.
4. open console to see details.

### Recover account in new device

> Please delete your localStorage or passkey in your device to test.

1. input your `Account` and `K1 Private Key`.
2. click `Generate Passkey` button.
3. click `Append New WA Pubkey` button.
4. open console to see details.
