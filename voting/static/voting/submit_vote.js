function createForm(formSpec, submitButton) {
    const form = document.createElement("form");
    const table = document.createElement("table");
    table.className = "table is-bordered";
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
                choiceLabel.className = "radio";
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
            input.className = "input";
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

function safeStringify(obj) {
    function sortObject(obj) {
        if (obj === null || typeof obj !== 'object')
            return obj;

        if (Array.isArray(obj))
            return obj.map(sortObject);

        return Object.keys(obj).sort().reduce((acc, key) => (acc[key] = sortObject(obj[key]), acc), {});
    }
    return JSON.stringify(obj, (_, obj) => sortObject(obj));
}

class SubmitVoteForm extends HTMLElement {
    constructor() {
        super();
        this.userId = this.getAttribute("user");

        // Create container structure
        const wrapper = document.createElement("div");
        wrapper.className = "vote-wrapper";
        this.appendChild(wrapper);
        this.wrapper = wrapper;

        const anonymousMessageContainer = document.createElement("p");
        anonymousMessageContainer.className = "block";
        const anonymousMessage = document.createElement("span");
        anonymousMessage.className = "tag";
        anonymousMessage.textContent = this.userId ? "Connecté" : "Session anonyme";
        anonymousMessageContainer.appendChild(anonymousMessage);
        wrapper.appendChild(anonymousMessageContainer);

        this.currentElement = null;
        this.introDismissed = false;
        this.errorsAt = {};
        this.formSpecs = {};

        this.statusOrder = ["", "INITIAL", "SIGNED", "TO_BE_SUBMITTED", "SUBMITTED"];

        // Allow dropping ballot files onto the form
        this.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
        });
        this.addEventListener("drop", async (e) => {
            e.preventDefault();
            await this.uploadBallotFiles(e.dataTransfer.files);
        });
    }

    connectedCallback() {
        // Fetch form spec and build form
        (async () => {
            // Start engine
            await this.runEngineForAll(true);
        })();
    }

    async displayBallotsList() {
        function createFontAwesomeElement(iconClass) {
            const iconElem = document.createElement("i");
            iconElem.className = iconClass;
            return iconElem;
        }

        let ballotsListContainer = document.createElement("div");

        let ballotsList = document.createElement("ul");
        ballotsListContainer.appendChild(ballotsList);
        this.ballotsListContainer?.remove();
        this.ballotsListContainer = ballotsListContainer;

        for (const voteToken of this.voteTokens) {
            const ballot = this.getBallot(voteToken);
            const voteId = ballot.voteId;
            const li = document.createElement("li");
            li.className = "dropdown is-block my-2";

            const voteName = document.createElement("button");
            voteName.className = "dropdown-trigger button";
            voteName.textContent = this.formSpecs[voteId].title || "Vote " + voteId;
            voteName.addEventListener("click", () => li.classList.toggle("is-active"));
            // close when clicking outside
            document.addEventListener("click", () => li.classList.remove("is-active"));
            li.addEventListener("click", (e) => e.stopPropagation());
            li.appendChild(voteName);

            const statusTag = document.createElement("span");
            const status = ballot.status || "";
            const [text, className] = (() => {
                switch (status) {
                    case "": return ["Non soumis", "light"];
                    case "INITIAL": return ["Prêt à signer", "info"];
                    case "SIGNED": return ["Signé", "info"];
                    case "TO_BE_SUBMITTED": return ["À envoyer", "info"];
                    case "SUBMITTED": return ["Envoyé", "success"];
                    default: return ["Statut inconnu", "light"];
                }
            })();
            statusTag.textContent = text;
            statusTag.className = "tag ml-2 is-" + className;
            voteName.appendChild(statusTag);

            const [canVote, canVoteReason] = this.formSpecs[voteId].can_vote;
            if (!canVote && canVoteReason == "ended") {
                const canVoteTag = document.createElement("span");
                canVoteTag.textContent = "Vote clos";
                canVoteTag.className = "tag ml-2 is-info";
                voteName.appendChild(canVoteTag);
            }
            if (!canVote && this.statusOrder.indexOf(status) < this.statusOrder.indexOf(canVoteReason == "user" ? "SIGNED" : "SUBMITTED")) {
                const canVoteTag = document.createElement("span");
                canVoteTag.textContent = "Impossible de voter !";
                canVoteTag.className = "tag ml-2 is-danger";
                voteName.appendChild(canVoteTag);
            }

            const dropdownMenu = document.createElement("div");
            dropdownMenu.className = "dropdown-menu";
            li.appendChild(dropdownMenu);

            const dropdownContent = document.createElement("div");
            dropdownContent.className = "dropdown-content";
            dropdownMenu.appendChild(dropdownContent);

            // download button
            const downloadBtn = document.createElement("button");
            downloadBtn.className = "dropdown-item";
            downloadBtn.appendChild(createFontAwesomeElement("fas fa-download"));
            downloadBtn.appendChild(document.createTextNode(" Télécharger le bulletin"));
            downloadBtn.addEventListener("click", () => {
                // download only this ballot
                const key = `ballot_${voteToken}`;
                const raw = localStorage.getItem(key);
                if (!raw) {
                    alert("Aucun bulletin local trouvé pour cet UUID.");
                    return;
                }
                const blob = new Blob([raw], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                const filename = `ballot_${voteToken}_${new Date().toISOString().slice(0,10)}.json`;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
            });
            dropdownContent.appendChild(downloadBtn);

            // delete button
            const deleteBtn = document.createElement("button");
            deleteBtn.className = "dropdown-item";
            deleteBtn.appendChild(createFontAwesomeElement("fas fa-xmark"));
            deleteBtn.appendChild(document.createTextNode(" Supprimer le bulletin"));
            deleteBtn.addEventListener("click", async () => {
                if (confirm("Confirmez-vous la suppression de ce bulletin local ?")) {
                    localStorage.removeItem(`ballot_${voteToken}`);
                    li.remove();
                    await this.runEngineForAll();
                }
            });
            dropdownContent.appendChild(deleteBtn);

            ballotsList.appendChild(li);
        }

        this.wrapper.appendChild(ballotsListContainer);

        return ballotsListContainer;
    }

    async engine(voteToken) {
        this.currentElement?.remove();
        let ballot = voteToken ? this.getBallot(voteToken) : {};
        // if any of the steps return true, it means that the step isn't done yet
        switch (ballot.status || "") {
            case "":
                if (!this.introDismissed && this.voteTokens.length)
                    return await this.displayIntro();
                return await this.createForms();
            case "INITIAL":
                return await this.blindAndSign(voteToken);
            case "SIGNED":
                return await this.showFinalOptions();
            case "TO_BE_SUBMITTED":
                return await this.submitBallot(voteToken);
            case "SUBMITTED":
                return await this.displaySuccess();
        }
    }

    async runEngineForAll(init) {
        // Support multiple comma-separated vote UUIDs.
        this.voteIds = this.getAttribute("uuid").split(",").map(s => s.trim()).filter(x => x);
        this.voteTokens = new Set();
        // also add the ones from localStorage
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith("ballot_"))
                this.voteTokens.add(this.getBallot(key.slice("ballot_".length)).token);
        }
        // convert to list
        this.voteTokens = [...this.voteTokens];
        this.yourVotes = [];
        try {
            this.yourVotes = JSON.parse(localStorage.getItem("your_votes")) || [];
        } catch(e) {}
        // create the misssing voteIds
        for (const voteId of this.voteIds) {
            const alreadyExists = this.yourVotes.some(voteToken => this.getBallot(voteToken).voteId == voteId);
            if (alreadyExists) continue;
            const newToken = forge.util.encode64(forge.random.getBytesSync(24));
            this.voteTokens.push(newToken);
            this.updateStorage(newToken, { voteId: voteId, token: newToken });
            this.yourVotes.push(newToken);
        }
        localStorage.setItem("your_votes", JSON.stringify(this.yourVotes));

        this.errorsAt = {};
        try {
            this.currentElement?.remove();
            await this.loadFormSpecs();
            while (true) {
                let toProcess = this.voteTokens.slice().sort((a, b) => {
                    const statusA = this.getBallot(a).status || "";
                    const statusB = this.getBallot(b).status || "";
                    return this.statusOrder.indexOf(statusA) - this.statusOrder.indexOf(statusB);
                });
                if (toProcess.length === 0) {
                    // display the "no votes" message
                    await this.engine();
                    return;
                }
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
                for (const voteToken of toProcess) {
                    try {
                        if (await this.engine(voteToken)) {
                            stop = true;
                            break;
                        }
                    } catch(e) {
                        this.errorsAt[voteToken] = this.getBallot(voteToken).status || "";
                        throw e;
                    }
                }
                if (stop)
                    break;
            }
        } catch(e) {
            this.currentElement?.remove();
            console.error(e);

            let messageContainer = document.createElement("p");
            messageContainer.className = "notification is-danger";
            let errorText = e.constructor == Error ? e.message : e + "";
            messageContainer.textContent = init ? "Erreur lors de l'initialisation : " + errorText : "Interrompu : " + errorText + ". Rechargez pour reprendre.";

            this.wrapper.appendChild(messageContainer);
        } finally {
            this.displayBallotsList();
        }
    }

    async displayIntro() {
        let introContainer = document.createElement("div");

        // List of ballots
        let introTextContainer = document.createElement("p");
        introTextContainer.className = "notification is-info";
        introTextContainer.textContent = "Vous allez voter pour les élections suivantes :";
        introContainer.appendChild(introTextContainer);

        let ballotsList = document.createElement("ul");
        introTextContainer.appendChild(ballotsList);

        // let electionsToVote = [...new Set([
        //     ...this.voteTokens.map(voteToken => this.getBallot(voteToken).voteId),
        //     ...this.voteIds,
        // ])];
        for (const voteToken of this.voteTokens) {
            const ballot = this.getBallot(voteToken);
            const voteId = ballot.voteId;
            if (this.statusOrder.indexOf(ballot.status || "") > 0)
                continue;
            const li = document.createElement("li");
            li.textContent = this.formSpecs[voteId].title || "Vote " + voteId;
            ballotsList.appendChild(li);
        }

        // Warning container
        let warningContainer = document.createElement("p");
        warningContainer.className = "notification is-warning";

        let warningTitle = document.createElement("strong");
        warningTitle.textContent = "Attention : ";
        warningContainer.appendChild(warningTitle);

        let warningText = document.createElement("span");
        warningText.textContent = "Assurez-vous d'être dans un environnement sécurisé avant de remplir votre bulletin de vote, afin d'éviter tout regard indiscret.";
        warningContainer.appendChild(warningText);

        let warningAcceptContainer = document.createElement("p");
        warningContainer.appendChild(warningAcceptContainer);

        let warningAccept = document.createElement("button");
        warningAccept.className = "button";
        warningAccept.textContent = "J'ai compris";
        warningAccept.addEventListener("click", () => {
            // for each vote in electionsToVote that doesn't have an associated entry in voteTokens,
            // create one with a random token
            // for (const voteId of electionsToVote) {
            //     const alreadyExists = this.voteTokens.some(voteToken => this.getBallot(voteToken).voteId == voteId);
            //     if (alreadyExists) continue;
            //     const newToken = forge.util.encode64(forge.random.getBytesSync(24));
            //     this.voteTokens.push(newToken);
            //     this.updateStorage(newToken, { voteId: voteId, token: newToken });
            // }

            this.introDismissed = true;
            this.runEngineForAll();
        });
        warningAcceptContainer.appendChild(warningAccept);

        introContainer.appendChild(warningContainer);

        this.wrapper.appendChild(introContainer);
        this.currentElement = introContainer;

        return true;
    }

    async loadFormSpecs() {
        let messageContainer = document.createElement("p");
        messageContainer.className = "notification is-info";
        messageContainer.textContent = "Chargement des formulaires...";
        this.wrapper.appendChild(messageContainer);
        this.currentElement = messageContainer;

        this.formSpecs = {};
        for (let voteToken of this.voteTokens) {
            const ballot = this.getBallot(voteToken);
            const voteId = ballot.voteId;
            if (this.formSpecs[voteId]) continue;
            const resp = await fetch(`/submit-vote/${voteId}`, { headers: { Accept: "application/json" } });
            if (!resp.ok) throw new Error(`Impossible de récupérer la spécification du formulaire pour le vote ${voteId}`);
            this.formSpecs[voteId] = await resp.json();
        }
    }

    async createForms() {
        if (!this.voteTokens.length) {
            let noVotesMessage = document.createElement("p");
            noVotesMessage.textContent = "Aucun vote à soumettre.";
            this.wrapper.appendChild(noVotesMessage);
            return noVotesMessage;
        }

        let formsContainer = document.createElement("div");

        for (let voteToken of this.voteTokens) {
            const existingBallot = this.getBallot(voteToken);
            const voteId = existingBallot.voteId;
            // restore the previous state if any
            if (this.statusOrder.indexOf(existingBallot.status || "") > 0) {
                // const alreadyVotedMessage = document.createElement("p");
                // alreadyVotedMessage.textContent = "(Déjà voté)";
                // section.appendChild(alreadyVotedMessage);

                // formsContainer.appendChild(section);
                continue;
            }

            const section = document.createElement("section");
            section.className = "block";

            const formSpec = this.formSpecs[voteId];

            const h = document.createElement("h2");
            h.className = "title";
            h.textContent = `Vote: ${formSpec.title || voteId}`;
            section.appendChild(h);

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

                this.updateStorage(voteToken, { data: voteData });
            });
            form.addEventListener("submit", e => e.preventDefault());
            formsContainer.appendChild(section);
        }

        // Submit area
        let submitZone = document.createElement("div");

        const submitBtn = document.createElement("button");
        submitBtn.className = "button";
        submitBtn.type = "button";
        submitBtn.textContent = "Envoyer";
        submitBtn.addEventListener("click", async () => {
            // if there are ballots with status 0 (not yet submitted), set them to INITIAL
            this.voteTokens.forEach(voteToken => {
                const ballot = this.getBallot(voteToken);
                if (!ballot.status)
                    this.updateStorage(voteToken, { status: "INITIAL" });
            });
            // then run the engine for all ballots until no further automatic progress can be made
            await this.runEngineForAll();
        });
        submitZone.appendChild(submitBtn);
        formsContainer.appendChild(submitBtn);

        this.wrapper.appendChild(formsContainer);
        this.currentElement = formsContainer;
        return true;
    }

    async getPublicKey(voteToken) {
        const ballot = this.getBallot(voteToken);
        const voteId = ballot.voteId;
        let messageContainer = document.createElement("p");
        messageContainer.className = "notification is-info";
        messageContainer.textContent = "Étape 1/3 : Récupération des clés sécurisées...";

        this.wrapper.appendChild(messageContainer);
        this.currentElement = messageContainer;

        try {
            const res = await fetch(`/vote/${voteId}/public-key`);
            if (!res.ok) throw new Error("Impossible de récupérer la clé");
            const pem = await res.text();

            const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("test"));
            const smallHash = Array.from(new Uint8Array(hashBuffer).slice(0, 4)).map((b) => b.toString(16).padStart(2, "0")).join("");

            const expectedHash = ballot.publicKeyHash;

            if (expectedHash && expectedHash != smallHash)
                throw new Error("La clé publique a changé depuis votre dernière visite. Ceci peut indiquer une attaque de type 'man-in-the-middle'. Veuillez contacter l'administrateur du vote.");

            this.updateStorage(voteToken, { publicKeyHash: smallHash });

            return pem;
        } finally {
            this.currentElement.remove();
        }
    }

    async blindAndSign(voteToken) {
        const publicKeyPem = await this.getPublicKey(voteToken);

        let messageContainer = document.createElement("p");
        messageContainer.className = "notification is-info";
        messageContainer.textContent = "Étape 2/3 : Signature anonyme du bulletin...";

        this.wrapper.appendChild(messageContainer);
        this.currentElement = messageContainer;

        const ballot = this.getBallot(voteToken);
        const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);

        const jsonPayload = safeStringify(ballot.data || {});
        const messageContent = `${ballot.token}:${jsonPayload}`;

        const md = forge.md.sha256.create();
        md.update(messageContent);
        const m = new forge.jsbn.BigInteger(md.digest().toHex(), 16);
        const r = new forge.jsbn.BigInteger(forge.util.bytesToHex(forge.random.getBytesSync(32)), 16).mod(publicKey.n);
        const blinded = m.multiply(r.modPow(publicKey.e, publicKey.n)).mod(publicKey.n);
        const blindedB64 = forge.util.encode64(forge.util.hexToBytes(blinded.toString(16)));

        const signRes = await fetch(`/vote/${ballot.voteId}/sign`, {
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

        this.updateStorage(voteToken, { signature: finalSigB64, status: "SIGNED" });
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
        messageContainer.className = "notification is-info";
        messageContainer.textContent = "Vos bulletins sont signés et prêts. Ils seront envoyés sans lien avec vos informations de connexion. Pour une sécurité maximale, téléchargez vos bulletins puis rendez-vous sur un autre appareil depuis un autre lieu pour les envoyer.";
        stepContainer.appendChild(messageContainer);

        let tokenDisplay = document.createElement("div");
        tokenDisplay.className = "block";
        tokenDisplay.textContent = "Vos jetons de vote sont :";

        let tokenList = document.createElement("ul");
        tokenDisplay.appendChild(tokenList);

        for (const voteToken of this.voteTokens) {
            const ballot = this.getBallot(voteToken);
            const li = document.createElement("li");
            li.textContent = `${this.formSpecs[ballot.voteId].title || "Vote " + ballot.voteId} : `;
            const codeElem = document.createElement("code");
            codeElem.textContent = ballot.token;
            li.appendChild(codeElem);
            tokenList.appendChild(li);
        }

        stepContainer.appendChild(tokenDisplay);

        let buttonsLine = document.createElement("div");
        buttonsLine.className = "buttons";
        stepContainer.appendChild(buttonsLine);

        const resendBtn = document.createElement("button");
        resendBtn.className = "button is-success";
        resendBtn.textContent = "Envoyer mes votes";
        resendBtn.addEventListener("click", () => {
            for (let voteToken of this.voteTokens) {
                if (this.statusOrder.indexOf(this.getBallot(voteToken).status || "") < this.statusOrder.indexOf("SUBMITTED"))
                    this.updateStorage(voteToken, { status: "TO_BE_SUBMITTED" });
            }
            this.runEngineForAll();
        });
        buttonsLine.appendChild(resendBtn);

        const resetBtn = document.createElement("button");
        resetBtn.className = "button is-danger";
        resetBtn.textContent = "Supprimer mes bulletins locaux";
        resetBtn.addEventListener("click", async () => {
            if (confirm("ATTENTION : Ceci supprimera vos bulletins localement. Si vous n'avez pas encore envoyé vos votes, vous perdrez la possibilité de le faire. Confirmez-vous la suppression ?")) {
                for (const id of this.voteTokens) {
                    localStorage.removeItem(`ballot_${id}`);
                    await this.runEngineForAll();
                }
                location.reload();
            }
        });
        buttonsLine.appendChild(resetBtn);

        this.wrapper.appendChild(stepContainer);
        this.currentElement = stepContainer;
        return true;
    }

    async submitBallot(voteToken, notFound) {
        let messageContainer = document.createElement("p");
        messageContainer.className = "notification is-info";
        messageContainer.textContent = (notFound ? "Le bulletin n'a pas été trouvé dans l'urne. " : "") + "Étape 3/3 : Dépôt du bulletin dans l'urne...";

        this.wrapper.appendChild(messageContainer);
        this.currentElement = messageContainer;

        const ballot = this.getBallot(voteToken);

        const formData = new FormData();
        formData.append("csrfmiddlewaretoken", this.getCsrf());
        formData.append("token", ballot.token);
        formData.append("signature", ballot.signature);
        const jsonPayload = safeStringify(ballot.data || {});
        formData.append("data", jsonPayload);

        const res = await fetch(`/vote/${ballot.voteId}/submit`, { method: "POST", body: formData, credentials: "omit" });
        if (!res.ok) throw new Error("Urne fermée ou bulletin invalide");

        this.updateStorage(voteToken, { status: "SUBMITTED" });
    }

    async displaySuccess() {
        let messageContainer = document.createElement("p");
        messageContainer.className = "notification is-success";
        messageContainer.textContent = "Vérification du dépôt des bulletins...";

        this.wrapper.appendChild(messageContainer);
        this.currentElement = messageContainer;

        let i = 1;
        for (let voteToken of this.voteTokens) {
            const ballot = this.getBallot(voteToken);
            let res = await fetch(`/data/ballots/${ballot.voteId}/${ballot.token}`, {credentials: "omit"});
            if (!res.ok) {
                this.updateStorage(voteToken, { status: "TO_BE_SUBMITTED" });
                throw new Error(`Bulletin non trouvé pour l'élection ${this.formSpecs[ballot.voteId].title}`);
            }
            let data = await res.json();
            let valid = (
                safeStringify(data) ===
                safeStringify(ballot.data || {})
            );
            if (!valid) {
                this.updateStorage(voteToken, { status: "TO_BE_SUBMITTED" });
                throw new Error(`Le bulletin dans l'urne pour l'élection ${this.formSpecs[ballot.voteId].title} ne correspond pas à celui que vous avez envoyé.`);
            }
            // Vérifier la signature
            if (!ballot.signature) {
                this.updateStorage(voteToken, { status: "TO_BE_SUBMITTED" });
                throw new Error(`Aucune signature trouvée pour le bulletin de l'élection ${this.formSpecs[ballot.voteId].title}.`);
            }
            const publicKeyPem = await this.getPublicKey(voteToken);
            const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
            const jsonPayload = safeStringify(ballot.data || {});
            const messageContent = `${ballot.token}:${jsonPayload}`;
            const sigInt = new forge.jsbn.BigInteger(forge.util.bytesToHex(forge.util.decode64(ballot.signature)), 16);
            this.checkSignatureMath(publicKey, messageContent, sigInt, ballot.signature);
            messageContainer.textContent = "Vérification du dépôt des bulletins... " + i + "/" + this.voteTokens.length + " OK";
            i++;
        }

        messageContainer.remove();

        const tokenDisplay = document.createElement("div");
        tokenDisplay.className = "notification is-success";

        const firstLine = document.createElement("h2");
        firstLine.className = "title";
        firstLine.textContent = "Votes enregistrés avec succès !";
        tokenDisplay.appendChild(firstLine);

        const secondLine = document.createElement("p");
        secondLine.textContent = "Vos jetons de vote sont disponibles ci-dessous.";
        tokenDisplay.appendChild(secondLine);

        const thirdLine = document.createElement("p");
        thirdLine.textContent = "Conservez précieusement ces jetons de vote, ils vous permettront de prouver que vous avez bien voté si nécessaire.";
        tokenDisplay.appendChild(thirdLine);

        const tokenList = document.createElement("ul");
        tokenDisplay.appendChild(tokenList);

        for (const voteToken of this.voteTokens) {
            const ballot = this.getBallot(voteToken);
            const li = document.createElement("li");
            li.textContent = `${this.formSpecs[ballot.voteId].title || "Vote " + ballot.voteId} : `;
            const codeElem = document.createElement("code");
            codeElem.textContent = ballot.token;
            li.appendChild(codeElem);
            tokenList.appendChild(li);
        }

        this.wrapper.appendChild(tokenDisplay);
        this.currentElement = tokenDisplay;
        return true;
    }

    updateStorage(voteToken, data) {
        let current = {};
        const key = `ballot_${voteToken}`;
        try {
            current = JSON.parse(localStorage.getItem(key));
        } catch(e) {}
        localStorage.setItem(key, JSON.stringify({ ...current, ...data }));
    }

    getBallot(voteToken) {
        try {
            return JSON.parse(localStorage.getItem(`ballot_${voteToken}`)) || {};
        } catch(e) {
            return {};
        }
    }
    getCsrf() {
        return document.querySelector("[name=csrfmiddlewaretoken]")?.value;
    }

    downloadBallots() {
        const results = [];
        this.voteTokens.forEach(id => {
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
        const filename = `ballots_${this.voteTokens.join("_")}_${new Date().toISOString().slice(0,10)}.json`;
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
            await this.uploadBallotFiles(input.files);
        });
        input.click();
    }

    async uploadBallotFiles(files) {
        [...files].forEach(async (file) => {
            try {
                const text = await file.text();
                let data = JSON.parse(text);
                if (!Array.isArray(data))
                    data = [data];
                let count = 0;
                for (var item of data) {
                    localStorage.setItem(`ballot_${item.token}`, JSON.stringify(item));
                    count++;
                }
                await this.runEngineForAll();
            } catch(e) {
                console.error(e);
                let messageContainer = document.createElement("p");
                messageContainer.className = "notification is-danger";
                let errorText = e.constructor == Error ? e.message : e + "";
                messageContainer.textContent = "Erreur lors de l'importation des bulletins : " + errorText;

                this.wrapper.appendChild(messageContainer);

                setTimeout(() => messageContainer.remove(), 5000);
            }
        });
    }
}

window.customElements.define("submit-vote-form", SubmitVoteForm);
