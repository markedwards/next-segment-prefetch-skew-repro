export const dynamic = "force-dynamic";
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <p id="server">server:{process.env.DEPLOY_ID}</p>
        {children}
      </body>
    </html>
  );
}
