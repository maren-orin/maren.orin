export const metadata = {
  title: 'Maren Orin',
  description: '',
}

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  )
}
