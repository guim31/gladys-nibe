# NIBE myUplink

Intègre vos **pompes à chaleur NIBE** à Gladys via **myUplink**, le cloud de NIBE : températures
(extérieure, départ et retour, eau chaude, intérieure), compresseur, mode de fonctionnement, décalage de la
courbe de chauffe, mode et boost d'eau chaude, chaleur produite et alarmes actives. Les pompes à chaleur du
groupe vendues sous d'autres marques sur la même plateforme (CTC, Contura…) apparaissent aussi, avec ce que
leurs points permettent.

> **Développée sans le matériel : vos retours sont les bienvenus.** L'intégration a été écrite et testée
> sur de vraies réponses myUplink publiées par d'autres projets, pas sur une pompe à chaleur. S'il manque
> quelque chose ou si une valeur est fausse chez vous, ouvrez une issue sur GitHub.
>
> Cette intégration n'est affiliée ni à NIBE ni à myUplink.

## Prérequis

- Une pompe à chaleur connectée à **myUplink** (vous la voyez dans l'application myUplink).
- Le **compte myUplink** auquel elle appartient (adresse e-mail et mot de passe de l'application).
- Gladys **5.1** ou plus récent.
- Pour **modifier** un réglage depuis Gladys (décalage de chauffe, mode d'eau chaude, boost) :
  l'abonnement payant myUplink **Premium Manage** pour cette pompe à chaleur, souscrit dans l'application
  myUplink. La lecture fonctionne sans.

## Configuration

Gladys dialogue avec myUplink grâce à une « application » que vous créez gratuitement sur le site
développeur de myUplink.

1. Ouvrez [dev.myuplink.com](https://dev.myuplink.com) et connectez-vous **avec le compte de votre pompe à
   chaleur** (le même que dans l'application myUplink). Acceptez les conditions d'utilisation de l'API si
   elles vous sont proposées.
2. Ouvrez **Applications**, puis **Create new application**.
3. Remplissez le formulaire :
   - **Name** : `Gladys` (au choix) ;
   - **Description** : `Gladys Assistant` ;
   - **Callback URL** : le formulaire l'exige mais cette intégration ne s'en sert jamais ; saisissez une
     adresse https comme `https://localhost/`.
4. Enregistrez. La page de l'application affiche un **Identifier** (l'identifiant client) et un
   **Secret**.
5. Dans Gladys, ouvrez **Intégrations → NIBE myUplink → Configuration** et collez l'**Identifier** dans
   **Identifiant (Client ID)** et le **Secret** dans **Secret (Client secret)**. Choisissez la langue des
   noms, gardez 5 minutes d'intervalle, enregistrez.
6. Cliquez sur **Tester la connexion** : Gladys indique combien de pompes à chaleur il a trouvées et si
   l'abonnement Premium Manage est actif.
7. Ouvrez l'onglet **Découverte** et ajoutez votre pompe à chaleur.

L'identifiant et le secret restent dans la configuration de Gladys. Le jeton d'accès que myUplink donne en
échange est gardé dans le volume `/data` de l'intégration et renouvelé environ toutes les heures ; aucun des
deux n'est jamais écrit dans les journaux.

## Appareils

Un appareil par pompe à chaleur, nommé d'après le produit et le système myUplink, par exemple
« F730 CU 3x400V (Maison) ». L'intégration cherche les valeurs suivantes parmi les centaines de points que
publie myUplink, et ne crée une fonctionnalité que si la pompe à chaleur l'a :

| Fonctionnalité                     | Type dans Gladys           | Remarques                                                                |
| ---------------------------------- | -------------------------- | ------------------------------------------------------------------------ |
| Température extérieure             | Température                | Sonde BT1                                                                |
| Température de départ              | Température                | BT2, ou le départ externe sur un SMO                                     |
| Température de retour              | Température                | BT3, ou le retour externe                                                |
| Température ECS (haut)             | Température                | BT7                                                                      |
| Température ECS (charge)           | Température                | BT6                                                                      |
| Température intérieure             | Température                | Sonde d'ambiance BT50, si elle est installée                             |
| Fréquence du compresseur           | Texte, par ex. « 57 Hz »   | Gladys n'a pas d'unité hertz                                             |
| Compresseur                        | Texte                      | Arrêté, démarrage, en marche, arrêt en cours                             |
| Mode de fonctionnement             | Texte                      | Ce pour quoi la PAC travaille : chauffage, eau chaude, rafraîchissement… |
| Décalage de la courbe de chauffe   | Sélection −10 … +10        | Commande, si myUplink en permet l'écriture                               |
| Mode eau chaude                    | Sélection                  | Économie, normal, confort, contrôle intelligent (selon modèle)           |
| Boost eau chaude                   | Marche/arrêt, ou sélection | « Temporary lux » ; une sélection de durées sur certains modèles         |
| Chaleur produite, chauffage (kWh)  | Compteur                   | Compteur de chaleur, si la PAC en a un                                   |
| Chaleur produite, eau chaude (kWh) | Compteur                   | Compteur de chaleur, si la PAC en a un                                   |
| Alarmes actives                    | Compteur                   | Nombre d'alarmes actives sur myUplink                                    |
| Alarme                             | Texte                      | Numéro et titre de la dernière alarme, ou « Aucune alarme »              |

Un réglage n'est proposé comme commande que si myUplink le marque **modifiable** sur votre pompe à
chaleur ; sinon il reste en lecture seule. Le décalage de la courbe de chauffe est volontairement une
sélection et non un thermostat : ce n'est pas une température, et un assistant vocal à qui l'on demande
« 21 degrés » ne doit jamais l'atteindre.

La chaleur produite est un compteur, pas un compteur d'énergie : Gladys compterait un index d'énergie comme
de l'électricité tirée de votre compteur principal, alors qu'il s'agit de chaleur fournie à la maison.

La fiche de l'appareil porte un badge **cloud**, ou **injoignable** quand la pompe à chaleur n'est plus
connectée à myUplink (ses dernières valeurs restent alors en l'état).

## Widget

Le widget **Pompe à chaleur** résume une PAC sur le tableau de bord : des tuiles en direct pour les
températures extérieure, de départ, d'eau chaude et intérieure, une liste d'état (connexion myUplink, mode
de fonctionnement, compresseur, décalage de courbe, mode d'eau chaude, boost, alarmes) et, si la PAC accepte
les commandes, des boutons pour lancer ou annuler le boost d'eau chaude et décaler la courbe d'un cran.
Choisissez la pompe à chaleur dans les réglages du widget.

## Déclencheur et actions de scène

- **Alarme de la pompe à chaleur** (déclencheur) : se déclenche quand une PAC signale une **nouvelle**
  alarme sur myUplink, une fois par alarme. Vous pouvez le limiter à une pompe à chaleur. Variables :
  numéro, titre, description et gravité de l'alarme, dans la langue de l'intégration. Les alarmes déjà
  actives à l'installation, ou déjà signalées avant un redémarrage, ne sont pas redéclenchées.
- **Actions** : les commandes sont des fonctionnalités d'appareil, une scène les modifie donc avec l'action
  standard **Contrôler un appareil** (boost en marche, décalage à −2, mode d'eau chaude…). Aucune action
  supplémentaire n'est nécessaire.
- Le bouton **Tester la connexion** de l'onglet Configuration vérifie l'identifiant et le secret, compte les
  pompes à chaleur et lit l'abonnement Premium Manage.

## Exemples de scènes

- **Être prévenu d'une panne** : déclencheur « Alarme de la pompe à chaleur » → action « Envoyer un
  message » : `Alarme PAC {{triggerEvent.data.alarm_number}} : {{triggerEvent.data.header}}`.
- **De l'eau chaude quand l'électricité est bon marché** : à 1 h 30 les jours d'heures creuses → contrôler
  l'appareil « Boost eau chaude » = marche.
- **Absent pour le week-end** : quand la maison est vide → « Décalage de la courbe de chauffe » = −2 ; au
  retour de quelqu'un → 0.
- **Surveillance du gel** : quand « Température extérieure » passe sous −15 °C → envoyer un message.

## Dépannage

- **« myUplink refuse l'identifiant ou le secret »** : recopiez-les depuis dev.myuplink.com, sans espace ;
  vérifiez que l'application existe toujours.
- **« Aucune pompe à chaleur sur ce compte myUplink »** : l'application a été créée avec un autre compte que
  celui de la PAC. Recréez-la en étant connecté avec le compte utilisé dans l'application myUplink.
- **« Modifier un réglage exige l'abonnement Premium Manage »** : la lecture fonctionne, l'écriture demande
  l'abonnement payant pour cette pompe à chaleur. Une fois abonné, réessayez : l'intégration le revérifie.
- **« Quota myUplink atteint »** : un autre programme utilise la même application (Home Assistant, un
  script…). Donnez-lui sa propre application, ou augmentez l'intervalle de rafraîchissement.
- **Des valeurs qui ne bougent pas** : la pompe à chaleur envoie elle-même ses données à myUplink toutes
  les quelques minutes ; vérifiez qu'elle est « connectée » dans l'application myUplink.
- **Une fonctionnalité manque** : votre modèle nomme ses points autrement. Redémarrez l'intégration avec
  `LOG_LEVEL=debug` : les journaux listent les rôles trouvés. Ouvrez une issue avec le modèle et cette
  ligne.

## Limites

- **Cloud uniquement** : pas d'accès local ; sans Internet, rien n'est lu ni écrit.
- **Quota et conditions** : myUplink limite le nombre de requêtes (25 par minute et par application au
  moment de l'écriture) et son API est offerte pour un usage personnel, selon les conditions de
  dev.myuplink.com. Chaque rafraîchissement coûte 1 requête, plus 1 par pompe à chaleur ajoutée à Gladys
  (plus 1 quand une alarme est active) ; l'intégration respecte les en-têtes de quota et attend quand on le
  lui demande. Toutes les 5 minutes par défaut, 1 minute au minimum.
- **Délai** : une modification faite dans Gladys atteint la pompe à chaleur en une ou deux minutes ; la
  lecture suivante la confirme.
- **L'écriture** exige l'abonnement Premium Manage.
- **Points** : seulement les valeurs listées plus haut, trouvées par leur numéro de registre NIBE, par la
  catégorie « smart home » de myUplink ou par leur nom anglais. Les identifiants de la série F et des
  modules intérieurs (VVM, SMO) sont connus ; sur la série S et les autres marques, l'intégration se fie aux
  noms, ce qui n'a pas pu être vérifié sur du vrai matériel.
- **L'électricité consommée** par la pompe à chaleur n'est pas lue : aucun point myUplink n'a pu être
  identifié avec certitude.
