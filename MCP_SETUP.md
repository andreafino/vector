# Assistente esterno (MCP)

Dall'app desktop Vector puoi esporre il diagramma aperto come server MCP, così un'AI esterna (un client MCP compatibile) può leggerlo e, se abiliti le modifiche, modificarlo con le stesse operazioni dell'editor e dell'assistente in chat.

Il pannello **MCP** compare nella barra in alto solo nell'app desktop, non nel browser.

## Prerequisiti

Per il tunnel pubblico serve la CLI di Microsoft Dev Tunnels, da installare e fare il login una volta sola:

```powershell
winget install Microsoft.devtunnel
devtunnel user login
```

Il server locale funziona anche senza la CLI: serve solo per il tunnel.

## Uso

1. Apri il pannello **MCP** e clicca **Avvia** nella sezione *Server locale*. Il server ascolta solo su `127.0.0.1`, porta `3939`.
2. Se vuoi che l'AI scriva nel diagramma, attiva **Consenti modifiche**. Di default il server è in sola lettura.
3. Clicca **Mostra token** e copia il token. Serve per ogni richiesta.
4. Per usare il server da un'AI esterna, clicca **Avvia tunnel**: Vector lancia `devtunnel host` e mostra l'URL pubblico `https://…/mcp`.
5. Configura il client MCP con l'URL del tunnel e il token in un header:
   - **claude.ai** (connettore personalizzato, sezione *Intestazioni della richiesta*): nome `x-api-key`, valore `<token>`. Il nome `Authorization` è riservato da Claude.ai per l'OAuth e non è accettato.
   - **Altri client**: `Authorization: Bearer <token>` oppure `x-api-key: <token>`.
6. Quando hai finito, clicca **Ferma tunnel** e poi **Ferma**.

Il server si spegne sempre alla chiusura dell'app e non si riattiva da solo al riavvio.

## Strumenti esposti

Letture (sempre disponibili):

- `getDiagram`: il diagramma completo in JSON.
- `listEntities`, `getEntity`: entità e dettaglio di una singola entità.
- `listFlows`: elenco dei flussi con numero di passi.
- `listIcons`: catalogo delle icone, con ricerca testuale (`query`). Senza query restituisce le icone curate di base.

Modifiche (solo con **Consenti modifiche** attivo): le stesse operazioni dell'assistente in chat, ad esempio:

- contenitori: `addBand`, `updateBand` (rinomina, posizione, dimensioni), `deleteBand` (elimina anche le entità al suo interno);
- entità: `addEntity`, `updateEntity`, `moveEntity`, `deleteElement`;
- dettagli interni alle entità: `addEntityModule`, `updateEntityModule`, `deleteEntityModule`;
- collegamenti e flussi: `addEdge`, `updateEdge`, `addFlow` (crea un flusso vuoto e restituisce l'id), `addFlowStep` (aggiunge un passo a un flusso per id, in coda o in una posizione; collegamento e direzione si deducono dalle entità), `updateFlow`, `updateFlowStep`, `deleteFlowStep`, `moveFlowStep` (i passi si indicano col numero da 1; `getFlow` li elenca);
- tecnologie: `addTechnology`, `updateTechnology`.

Le icone si impostano con il campo `icona` di `addEntity`, `updateEntity`, `addTechnology` e `updateTechnology`. L'id va preso da `listIcons`: un id inesistente viene rifiutato con un messaggio di errore, invece di creare un'icona rotta.

Ogni modifica via MCP entra nello storico versioni con origine `mcp` e con il nome del client come autore, così la vedi nel pannello storico accanto alle modifiche manuali e a quelle della chat. Annulla e ripeti funzionano normalmente.

## Sicurezza

Il tunnel viene creato con `--allow-anonymous`: i client MCP remoti non possono fare il login Microsoft, quindi l'accesso è protetto solo dal token. Chiunque abbia URL e token può leggere il diagramma aperto, e modificarlo se le modifiche sono attive.

- Condividi il tunnel solo con client di cui ti fidi.
- Ferma il tunnel quando non ti serve.
- Rigenera il token se pensi che sia uscito dal tuo controllo: invalida quello vecchio e riavvia il server.
- Il token è cifrato con `safeStorage` di Electron, legato al tuo utente di Windows. Se la cifratura non è disponibile, il token viene generato a ogni avvio e non viene salvato.

## Limiti noti

- Non tutti i client MCP permettono di impostare un header `Authorization` personalizzato. I connettori che supportano solo OAuth non funzionano con questo schema di token.
- Le chiamate hanno un timeout di 15 secondi; se Vector non risponde in tempo, il client riceve un errore.
- Il server espone il diagramma aperto nella finestra principale: se hai più finestre, risponde solo quella principale.
