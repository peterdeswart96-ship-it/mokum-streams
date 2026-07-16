# Achtergrondfoto van de zaal

Zet hier een foto van de Mokum-zaal neer als **`zaal.jpg`**.

- **Liggend**, minimaal **1920px breed** (hij vult een 1920×1080-scherm, `background-size: cover`)
- Bij voorkeur een **rustig midden** — daar staat de kaart met de QR overheen
- Houd 'm onder ~500 kB; hij wordt toch verduisterd, dus een lichte compressie zie je niet

Ontbreekt het bestand, dan is dat **geen probleem**: de kaart valt terug op een
gradiënt-achtergrond in dezelfde tint. De browser slaat een ontbrekende
achtergrondlaag gewoon over — je krijgt dus geen kapot beeld op de stream.

De foto wordt hoe dan ook flink verduisterd (`.scrim` in `slides/01-mokum-live.html`).
Zonder die verduistering is geen enkele tekst er leesbaar op.
