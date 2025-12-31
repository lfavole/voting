function createForm(formSpec, submitButton) {
    const form = document.createElement("form");
    const table = document.createElement("table");
    form.appendChild(table);

    // Row for choices labels (if needed)
    // if all the fields in the formSpec.fields have exactly the same choices, we can render a header row
    let allHaveSameChoices = Object.keys(formSpec.fields).length > 1 && Object.values(formSpec.fields).reduce((acc, field) => {
        if (!field.choices) return false;
        if (acc === null) return field.choices;
        const currentChoices = field.choices;
        // return acc === currentChoices ? acc : false;
        return acc.length == currentChoices.length && acc.every((choice, idx) => {
            const currentChoice = currentChoices[idx];
            return currentChoice && choice.value === currentChoice.value && choice.display === currentChoice.display;
        }) ? acc : false;
    }, null);
    if (allHaveSameChoices) {
        const headerTr = document.createElement("tr");
        const emptyTh = document.createElement("th");
        headerTr.appendChild(emptyTh);
        allHaveSameChoices.forEach(choice => {
            const choiceTh = document.createElement("th");
            choiceTh.textContent = choice.display || choice.value;
            headerTr.appendChild(choiceTh);
        });
        table.appendChild(headerTr);
    }

    // Fields

    formSpec.field_order.forEach(fieldName => {
        const fieldSpec = formSpec.fields[fieldName];

        // Row for label + input
        const fieldTr = document.createElement("tr");

        const labelTd = document.createElement("td");
        const label = document.createElement("label");
        label.textContent = fieldSpec.label || fieldName;
        label.htmlFor = fieldName;
        labelTd.appendChild(label);
        fieldTr.appendChild(labelTd);

        const inputTd = document.createElement("td");

        if (fieldSpec.choices && fieldSpec.choices.length > 0) {
            fieldSpec.choices.forEach(choice => {
                const choiceTd = document.createElement("td");
                const choiceLabel = document.createElement("label");
                const choiceInput = document.createElement("input");
                choiceInput.type = "radio";
                choiceInput.name = fieldName;
                choiceInput.value = choice.value;
                if (choice.value === fieldSpec.value) choiceInput.checked = true;
                choiceLabel.appendChild(choiceInput);
                if (!allHaveSameChoices)
                    choiceLabel.appendChild(document.createTextNode(" " + (choice.display || choice.value)));
                choiceTd.appendChild(choiceLabel);
                fieldTr.appendChild(choiceTd);
            });
        } else {
            const input = document.createElement("input");
            input.type = "text";
            input.name = fieldName;
            input.id = fieldName;
            input.value = fieldSpec.value || "";
            if (fieldSpec.widget && fieldSpec.widget.attrs) {
                for (const [attrKey, attrValue] of Object.entries(fieldSpec.widget.attrs)) {
                    input.setAttribute(attrKey, attrValue);
                }
            }
            inputTd.appendChild(input);
        }

        fieldTr.appendChild(inputTd);
        table.appendChild(fieldTr);

        if (fieldSpec.help_text) {
            const helpTr = document.createElement("tr");
            const helpTd = document.createElement("td");
            helpTd.colSpan = 2;
            const helpText = document.createElement("small");
            helpText.className = "form-text text-muted";
            helpText.textContent = fieldSpec.help_text;
            helpTd.appendChild(helpText);
            helpTr.appendChild(helpTd);
            table.appendChild(helpTr);
        }

        if (fieldSpec.errors && fieldSpec.errors.length > 0) {
            const errTr = document.createElement("tr");
            const errTd = document.createElement("td");
            errTd.colSpan = 2;
            const errorList = document.createElement("ul");
            errorList.className = "form-errors";
            fieldSpec.errors.forEach(errorMsg => {
                const errorItem = document.createElement("li");
                errorItem.textContent = errorMsg;
                errorList.appendChild(errorItem);
            });
            errTd.appendChild(errorList);
            errTr.appendChild(errTd);
            table.appendChild(errTr);
        }
    });

    if (submitButton) {
        // add a line to submit
        const submitTr = document.createElement("tr");
        const submitTd = document.createElement("td");
        submitTd.colSpan = Math.max(...[...table.querySelectorAll("tr")].map(tr => tr.children.length), 2);
        const submitBtn = document.createElement("button");
        submitBtn.type = "submit";
        submitBtn.className = "btn-submit";
        submitBtn.textContent = "Soumettre le vote";
        submitTd.appendChild(submitBtn);
        submitTr.appendChild(submitTd);
        table.appendChild(submitTr);
    }

    return form;
}

class SubmitVoteForm extends HTMLElement {
    constructor() {
        super();
        // Support multiple comma-separated vote UUIDs.
        this.voteIds = this.getAttribute("uuid").split(",").map(s => s.trim()).filter(x => x);
        this.attachShadow({ mode: "open" });

        // Create container structure
        const wrapper = document.createElement("div");
        wrapper.className = "vote-wrapper";

        // Controls: download button (always present)
        const controlRow = document.createElement("p");
        controlRow.className = "vote-controls";

        const downloadBtn = document.createElement("button");
        downloadBtn.type = "button";
        downloadBtn.textContent = this.voteIds.length > 1 ? "Télécharger bulletins" : "Télécharger bulletin";
        downloadBtn.addEventListener("click", () => this.downloadBallots());
        controlRow.appendChild(downloadBtn);

        const uploadBtn = document.createElement("button");
        uploadBtn.type = "button";
        uploadBtn.textContent = "Charger bulletins";
        uploadBtn.addEventListener("click", () => this.uploadBallots());
        controlRow.appendChild(uploadBtn);

        wrapper.appendChild(controlRow);

        const style = document.createElement("style");
        style.textContent = `
            table {
                width: 100%;
                text-align: center;
            }
            tr:nth-child(odd) { background: #f9f9f9; }
            th, td {
                padding: 0.5rem;
                border-bottom: 1px solid #e1e1e1;
            }
            th {
                background: #f3f4f6;
            }
            .vote-wrapper {
                max-width: 600px;
                margin: 2rem auto;
                padding: 2rem;
                background: #ffffff;
                border: 1px solid #e1e1e1;
                border-radius: 8px;
                font-family: system-ui, -apple-system, sans-serif;
            }
            .vote-wrapper p:first-child { margin-top: 0; }
            .vote-wrapper p:last-child { margin-bottom: 0; }
            .status-box {
                padding: 1rem;
                border-radius: 4px;
                border: 1px solid black;
            }
            /* États de la boîte de statut */
            .status-box.info { background: #e3f2fd; color: #0d47a1; border-color: #bbdefb; }
            .status-box.success { background: #e8f5e9; color: #1b5e20; border-color: #c8e6c9; }
            .status-box.error { background: #ffebee; color: #b71c1c; border-color: #ffcdd2; }
            .status-box.warning { background: #fffde7; color: #f57f17; border-color: #fff9c4; }
            .status-box.warning button { background: #f57f17; color: #fffde7; }

            #form-fields p { margin-bottom: 1rem; border-bottom: 1px solid #f0f0f0; padding-bottom: 0.5rem; }
            button, input[type=button] { padding: 0.6rem 1.2rem; border: none; border-radius: 4px; cursor: pointer; }
            .btn-success { background: #059669; color: white; }
            .btn-submit { background: #2563eb; }
            .btn-submit:disabled { background: #94a3b8; }
            button + button { margin-left: 1rem; }
            code { background: #f1f5f9; padding: 0.2rem; border-radius: 4px; word-break: break-all; font-size: 0.85rem; }
        `;
        this.shadowRoot.appendChild(style);

        this.wrapper = wrapper;

        this.shadowRoot.appendChild(wrapper);

        this.currentElement = null;
        this.introDismissed = false;
        this.errorsAt = {};
        this.formSpecs = {};

        this.statusOrder = ["", "INITIAL", "SIGNED", "TO_BE_SUBMITTED", "SUBMITTED"];
    }

    connectedCallback() {
        // Fetch form spec and build form
        (async () => {
            // Start engine
            await this.runEngineForAll(true);
        })();
    }

    async engine(voteId) {
        this.currentElement?.remove();
        let ballot = this.getBallot(voteId);
        switch (ballot.status || "") {
            case "":
                if (!this.introDismissed)
                    this.currentElement = await this.displayIntro();
                else
                    this.currentElement = await this.createForms();
                break;
            case "INITIAL":
                this.currentElement = await this.blindAndSign(voteId);
                break;
            case "SIGNED":
                this.currentElement = await this.showFinalOptions();
                break;
            case "TO_BE_SUBMITTED":
                this.currentElement = await this.submitBallot(voteId);
                break;
            case "SUBMITTED":
                this.currentElement = await this.displaySuccess();
                break;
        }
    }

    async runEngineForAll(init) {
        this.errorsAt = {};
        try {
            if (!Object.keys(this.formSpecs).length)
                await this.loadFormSpecs();
            while (true) {
                let toProcess = this.voteIds.slice().sort((a, b) => {
                    const statusA = this.getBallot(a).status || "";
                    const statusB = this.getBallot(b).status || "";
                    return this.statusOrder.indexOf(statusA) - this.statusOrder.indexOf(statusB);
                });
                if (toProcess.length === 0) return;
                // Run all the votes with the earliest status
                toProcess = toProcess.filter(id => {
                    return (this.getBallot(id).status || "") == (this.getBallot(toProcess[0]).status || "");
                });
                if (toProcess.every(id => this.errorsAt[id] === (this.getBallot(id).status || ""))) {
                    // All the remaining ballots are stuck at the same status as before, stop processing
                    break;
                }
                // If all of them are done, continue to the next step
                let stop = false;
                for (const voteId of toProcess) {
                    try {
                        await this.engine(voteId);
                    } catch(e) {
                        this.errorsAt[voteId] = this.getBallot(voteId).status || "";
                        throw e;
                    }
                    if (this.shadowRoot.contains(this.currentElement)) {
                        stop = true;
                        break;
                    }
                }
                if (stop)
                    break;
            }
        } catch (e) {
            console.error(e);

            let messageContainer = document.createElement("p");
            messageContainer.className = "status-box error";
            let errorText = e.constructor == Error ? e.message : e + "";
            messageContainer.textContent = init ? "Erreur lors de l'initialisation : " + errorText : "Interrompu : " + errorText + ". Rechargez pour reprendre.";

            this.wrapper.appendChild(messageContainer);
        }
    }

    async displayIntro() {
        let introContainer = document.createElement("div");

        // List of ballots
        let introTextContainer = document.createElement("p");
        introTextContainer.className = "status-box info";
        introTextContainer.textContent = "Vous allez voter pour les élections suivantes :";
        introContainer.appendChild(introTextContainer);

        let ballotsList = document.createElement("ul");
        introTextContainer.appendChild(ballotsList);

        for (const voteId of this.voteIds) {
            const ballot = this.getBallot(voteId);
            if (this.statusOrder.indexOf(ballot.status || "") > 0)
                continue;
            const li = document.createElement("li");
            li.textContent = this.formSpecs[voteId].title || "Vote " + voteId;
            ballotsList.appendChild(li);
        }

        // Warning container
        let warningContainer = document.createElement("p");
        warningContainer.className = "status-box warning";

        let warningTitle = document.createElement("strong");
        warningTitle.textContent = "Attention : ";
        warningContainer.appendChild(warningTitle);

        let warningText = document.createElement("span");
        warningText.textContent = "Assurez-vous d'être dans un environnement sécurisé avant de remplir votre bulletin de vote, afin d'éviter tout regard indiscret.";
        warningContainer.appendChild(warningText);

        let warningAcceptContainer = document.createElement("p");
        warningContainer.appendChild(warningAcceptContainer);

        let warningAccept = document.createElement("button");
        warningAccept.type = "button";
        warningAccept.textContent = "J'ai compris";
        warningAccept.addEventListener("click", () => {
            this.introDismissed = true;
            this.runEngineForAll();
        });
        warningAcceptContainer.appendChild(warningAccept);

        introContainer.appendChild(warningContainer);

        this.wrapper.appendChild(introContainer);

        return introContainer;
    }

    async loadFormSpecs() {
        let messageContainer = document.createElement("p");
        messageContainer.className = "status-box info";
        messageContainer.textContent = "Chargement des formulaires...";
        this.wrapper.appendChild(messageContainer);

        try {
            this.formSpecs = {};
            for (let voteId of this.voteIds) {
                const resp = await fetch(`/submit-vote/${voteId}`, { headers: { Accept: "application/json" } });
                if (!resp.ok) throw new Error(`Impossible de récupérer la spécification du formulaire pour le vote ${voteId}`);
                this.formSpecs[voteId] = await resp.json();
            }
        } finally {
            messageContainer.remove();
        }
    }

    async createForms() {
        let formsContainer = document.createElement("div");
        this.wrapper.appendChild(formsContainer);

        for (let voteId of this.voteIds) {
            const section = document.createElement("section");
            section.className = "vote-section";

            const formSpec = this.formSpecs[voteId];

            const h = document.createElement("h3");
            h.textContent = `Vote: ${formSpec.title || voteId}`;
            section.appendChild(h);

            // restore the previous state if any
            const existingBallot = this.getBallot(voteId);
            if (this.statusOrder.indexOf(existingBallot.status || "") > 0) {
                const alreadyVotedMessage = document.createElement("p");
                alreadyVotedMessage.textContent = "(Déjà voté)";
                section.appendChild(alreadyVotedMessage);

                formsContainer.appendChild(section);
                continue;
            }

            const form = createForm(formSpec);
            section.appendChild(form);

            if (existingBallot.data) {
                const formData = new FormData();
                if (existingBallot.data.choice !== undefined) {
                    formData.set("choice", existingBallot.data.choice === true ? "yes" : existingBallot.data.choice === false ? "no" : "");
                } else if (existingBallot.data.persons) {
                    for (const [personId, selection] of Object.entries(existingBallot.data.persons)) {
                        formData.set(`person_${personId}`, selection);
                    }
                } else {
                    for (var key in existingBallot.data)
                        formData.append(key, existingBallot.data[key]);
                }
                for (const [key, value] of formData.entries()) {
                    const input = form.querySelector(`[name="${key}"]`);
                    if (input) {
                        if (input.type === "radio") {
                            const radioToCheck = form.querySelector(`[name="${key}"][value="${value}"]`);
                            if (radioToCheck) radioToCheck.checked = true;
                        } else {
                            input.value = value;
                        }
                    }
                }
            }

            // per-form input and submit handlers
            form.addEventListener("input", () => {
                const formData = new FormData(form);
                const voteData = {};
                if (formData.get("choice")) {
                    voteData.choice = formData.get("choice") == "yes" ? true : formData.get("choice") == "no" ? false : null;
                } else if ([...formData.keys()].every(k => k.startsWith("person_"))) {
                    voteData.persons = {};
                    Array.from(formData.keys()).forEach(k => {
                        voteData.persons[k.split("_")[1]] = formData.get(k);
                    });
                } else {
                    for (var pair of formData.entries())
                        voteData[pair[0]] = pair[1];
                }

                this.updateStorage(voteId, { data: voteData });
            });
            if (!this.getBallot(voteId).token)
                this.updateStorage(voteId, { token: forge.util.encode64(forge.random.getBytesSync(24)) });
            form.addEventListener("submit", e => e.preventDefault());
            formsContainer.appendChild(section);
        }

        // Submit area
        let submitZone = document.createElement("div");

        const submitBtn = document.createElement("button");
        submitBtn.type = "button";
        submitBtn.textContent = "Envoyer";
        submitBtn.addEventListener("click", async () => {
            // if there are ballots with status 0 (not yet submitted), set them to INITIAL
            this.voteIds.forEach(voteId => {
                const ballot = this.getBallot(voteId);
                if (!ballot.status)
                    this.updateStorage(voteId, { status: "INITIAL" });
            });
            // then run the engine for all ballots until no further automatic progress can be made
            await this.runEngineForAll();
        });
        submitZone.appendChild(submitBtn);
        formsContainer.appendChild(submitBtn);
        return formsContainer;
    }

    async getPublicKey(voteId) {
        let stepContainer = document.createElement("div");

        let messageContainer = document.createElement("p");
        messageContainer.className = "status-box info";
        messageContainer.textContent = "Étape 1/3 : Récupération des clés sécurisées...";
        stepContainer.appendChild(messageContainer);

        this.wrapper.appendChild(stepContainer);

        try {
            const res = await fetch(`/vote/${voteId}/public-key`);
            if (!res.ok) throw new Error("Impossible de récupérer la clé");
            const pem = await res.text();

            const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("test"));
            const smallHash = Array.from(new Uint8Array(hashBuffer).slice(0, 4)).map((b) => b.toString(16).padStart(2, "0")).join("");

            const expectedHash = this.getBallot(voteId).publicKeyHash;

            if (expectedHash && expectedHash != smallHash)
                throw new Error("La clé publique a changé depuis votre dernière visite. Ceci peut indiquer une attaque de type 'man-in-the-middle'. Veuillez contacter l'administrateur du vote.");

            this.updateStorage(voteId, { publicKeyHash: smallHash });

            return pem;
        } finally {
            stepContainer.remove();
        }
    }

    async blindAndSign(voteId) {
        const publicKeyPem = await this.getPublicKey(voteId);

        let stepContainer = document.createElement("div");

        let messageContainer = document.createElement("p");
        messageContainer.className = "status-box info";
        messageContainer.textContent = "Étape 2/3 : Signature anonyme du bulletin...";
        stepContainer.appendChild(messageContainer);

        this.wrapper.appendChild(stepContainer);

        try {
            const ballot = this.getBallot(voteId);
            const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);

            const jsonPayload = JSON.stringify(ballot.data || {}, Object.keys(ballot.data || {}).sort(), 0);
            const messageContent = `${ballot.token}:${jsonPayload}`;

            const md = forge.md.sha256.create();
            md.update(messageContent);
            const m = new forge.jsbn.BigInteger(md.digest().toHex(), 16);
            const r = new forge.jsbn.BigInteger(forge.util.bytesToHex(forge.random.getBytesSync(32)), 16).mod(publicKey.n);
            const blinded = m.multiply(r.modPow(publicKey.e, publicKey.n)).mod(publicKey.n);
            const blindedB64 = forge.util.encode64(forge.util.hexToBytes(blinded.toString(16)));

            const signRes = await fetch(`/vote/${voteId}/sign`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-CSRFToken": this.getCsrf() },
                body: JSON.stringify({ blinded_message: blindedB64 }),
            });
            if (!signRes.ok) throw new Error("Le serveur a refusé la signature : " + (await signRes.json()).error);
            const { signature: sigBlindB64 } = await signRes.json();

            const sigBlindInt = new forge.jsbn.BigInteger(forge.util.bytesToHex(forge.util.decode64(sigBlindB64)), 16);
            const rInv = r.modInverse(publicKey.n);
            const finalSigInt = sigBlindInt.multiply(rInv).mod(publicKey.n);
            const finalSigB64 = forge.util.encode64(forge.util.hexToBytes(finalSigInt.toString(16)));

            this.checkSignatureMath(publicKey, messageContent, finalSigInt, finalSigB64);

            this.updateStorage(voteId, { signature: finalSigB64, status: "SIGNED" });
        } finally {
            stepContainer.remove();
        }
    }

    checkSignatureMath(pubKey, msg, sigInt /*, sigB64 */) {
        const md = forge.md.sha256.create();
        md.update(msg);
        const mFromSig = sigInt.modPow(pubKey.e, pubKey.n);
        if (md.digest().toHex() !== mFromSig.toString(16).padStart(64, "0")) {
            throw new Error("ALERTE : Signature corrompue détectée.");
        }
    }

    async showFinalOptions() {
        let stepContainer = document.createElement("div");

        let messageContainer = document.createElement("p");
        messageContainer.className = "status-box info";
        messageContainer.textContent = "Vos bulletins sont signés et prêts.";
        stepContainer.appendChild(messageContainer);

        this.wrapper.appendChild(stepContainer);

        let tokenDisplay = document.createElement("div");
        tokenDisplay.textContent = `Vos jetons de vote sont : `;

        let tokenList = document.createElement("ul");
        tokenDisplay.appendChild(tokenList);

        for (const voteId of this.voteIds) {
            const ballot = this.getBallot(voteId);
            const li = document.createElement("li");
            li.textContent = `${this.formSpecs[voteId].title || "Vote " + voteId} : `;
            const codeElem = document.createElement("code");
            codeElem.textContent = ballot.token;
            li.appendChild(codeElem);
            tokenList.appendChild(li);
        }

        stepContainer.appendChild(tokenDisplay);

        let buttonsLine = document.createElement("div");
        stepContainer.appendChild(buttonsLine);

        const resendBtn = document.createElement("button");
        resendBtn.className = "btn-success";
        resendBtn.textContent = "Envoyer mes votes";
        resendBtn.addEventListener("click", () => {
            for (let voteId of this.voteIds) {
                this.updateStorage(voteId, { status: "TO_BE_SUBMITTED" });
            }
            this.runEngineForAll();
        });
        buttonsLine.appendChild(resendBtn);

        const resetBtn = document.createElement("button");
        resetBtn.textContent = "Supprimer mes bulletins locaux";
        resetBtn.addEventListener("click", () => {
            if (confirm("ATTENTION : Ceci supprimera vos bulletins localement. Si vous n'avez pas encore envoyé vos votes, vous perdrez la possibilité de le faire. Confirmez-vous la suppression ?")) {
                this.voteIds.forEach(id => {
                    localStorage.removeItem(`ballot_${id}`);
                });
                location.reload();
            }
        });
        buttonsLine.appendChild(resetBtn);

        return stepContainer;
    }

    async submitBallot(voteId, notFound) {
        let stepContainer = document.createElement("div");

        let messageContainer = document.createElement("p");
        messageContainer.className = "status-box info";
        messageContainer.textContent = (notFound ? "Le bulletin n'a pas été trouvé dans l'urne. " : "") + "Étape 3/3 : Dépôt du bulletin dans l'urne...";
        stepContainer.appendChild(messageContainer);

        this.wrapper.appendChild(stepContainer);

        try {
            const ballot = this.getBallot(voteId);

            const formData = new FormData();
            formData.append("csrfmiddlewaretoken", this.getCsrf());
            formData.append("token", ballot.token);
            formData.append("signature", ballot.signature);
            const jsonPayload = JSON.stringify(ballot.data || {}, Object.keys(ballot.data || {}).sort(), 0);
            formData.append("data", jsonPayload);

            const res = await fetch(`/vote/${voteId}/submit`, { method: "POST", body: formData });
            if (!res.ok) throw new Error("Urne fermée ou bulletin invalide");

            this.updateStorage(voteId, { status: "SUBMITTED" });
        } finally {
            stepContainer.remove();
        }
    }

    async displaySuccess() {
        let stepContainer = document.createElement("div");

        let messageContainer = document.createElement("p");
        messageContainer.className = "status-box success";
        messageContainer.textContent = "Vérification du dépôt des bulletins...";
        stepContainer.appendChild(messageContainer);

        this.wrapper.appendChild(stepContainer);

        let i = 1;
        for (let voteId of this.voteIds) {
            const ballot = this.getBallot(voteId);
            let res = await fetch(`/data/ballots/${voteId}/${ballot.token}`);
            if (!res.ok) {
                this.updateStorage(voteId, { status: "TO_BE_SUBMITTED" });
                throw new Error("Bulletin non trouvé pour l'élection " + this.formSpecs[voteId].title);
            }
            let data = await res.json();
            let valid = (
                JSON.stringify(data, Object.keys(data).sort(), 0) ===
                JSON.stringify(ballot.data || {}, Object.keys(ballot.data || {}).sort(), 0)
            );
            if (!valid) {
                this.updateStorage(voteId, { status: "TO_BE_SUBMITTED" });
                throw new Error("Le bulletin dans l'urne ne correspond pas à celui que vous avez envoyé.");
            }
            messageContainer.textContent = "Vérification du dépôt des bulletins... " + i + "/" + this.voteIds.length + " OK";
            i++;
        }

        messageContainer.textContent = "Votes enregistrés avec succès !";

        let tokenDisplay = document.createElement("div");
        tokenDisplay.textContent = `Jetons de vote : `;

        let tokenList = document.createElement("ul");
        tokenDisplay.appendChild(tokenList);

        for (const voteId of this.voteIds) {
            const ballot = this.getBallot(voteId);
            const li = document.createElement("li");
            li.textContent = `${this.formSpecs[voteId].title || "Vote " + voteId} : `;
            const codeElem = document.createElement("code");
            codeElem.textContent = ballot.token;
            li.appendChild(codeElem);
            tokenList.appendChild(li);
        }

        stepContainer.appendChild(tokenDisplay);

        return stepContainer;
    }

    updateStorage(voteId, data) {
        let current = {};
        const key = `ballot_${voteId}`;
        try {
            current = JSON.parse(localStorage.getItem(key));
        } catch(e) {}
        localStorage.setItem(key, JSON.stringify({ ...current, ...data }));
    }

    getBallot(voteId) {
        try {
            return JSON.parse(localStorage.getItem(`ballot_${voteId}`)) || {};
        } catch(e) {
            return {};
        }
    }
    getCsrf() {
        return document.querySelector("[name=csrfmiddlewaretoken]")?.value;
    }

    downloadBallots() {
        const results = [];
        this.voteIds.forEach(id => {
            const key = `ballot_${id}`;
            const raw = localStorage.getItem(key);
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    results.push({ vote_id: id, ballot: parsed });
                } catch(e) {
                    results.push({ vote_id: id, raw: raw });
                }
            }
        });
        if (results.length === 0) {
            alert("Aucun bulletin local trouvé pour les UUIDs fournis.");
            return;
        }
        const blob = new Blob([JSON.stringify(results)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const filename = `ballots_${this.voteIds.join("_")}_${new Date().toISOString().slice(0,10)}.json`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    uploadBallots() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json";
        input.addEventListener("change", async () => {
            const file = input.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                for (var item of data) {
                    if (this.voteIds.includes(item.vote_id)) {
                        const key = `ballot_${item.vote_id}`;
                        localStorage.setItem(key, JSON.stringify(item.ballot));
                        count++;
                    }
                }
                await this.loadFormSpecs();
                this.runEngineForAll();
            } catch(e) {
                let messageContainer = document.createElement("p");
                messageContainer.className = "status-box error";
                let errorText = e.constructor == Error ? e.message : e + "";
                messageContainer.textContent = "Erreur lors de l'importation des bulletins : " + errorText;

                this.wrapper.appendChild(messageContainer);

                setTimeout(() => messageContainer.remove(), 5000);
            }
        });
        input.click();
    }
}

window.customElements.define("submit-vote-form", SubmitVoteForm);
