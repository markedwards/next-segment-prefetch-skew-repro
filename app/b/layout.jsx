import Widget from "./Widget";
export default function BLayout({ children }) {
  return (
    <section>
      <Widget />
      {children}
    </section>
  );
}
