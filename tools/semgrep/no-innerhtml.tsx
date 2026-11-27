export function bad(el: HTMLElement, text: string) {
  // ruleid: etkinlik-no-innerhtml
  el.innerHTML = text;
  // ruleid: etkinlik-no-innerhtml
  el.insertAdjacentHTML('beforeend', text);
  // ok: etkinlik-no-innerhtml
  el.textContent = text;
}
// ruleid: etkinlik-no-innerhtml
export const Bad = ({ html }: { html: string }) => (
  <div dangerouslySetInnerHTML={{ __html: html }} />
);
