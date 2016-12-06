angular
  .module('walletApp')
  .controller('SfoxCheckoutController', SfoxCheckoutController);

function SfoxCheckoutController ($scope, $timeout, $q, Wallet, MyWalletHelpers, Alerts, currency, modals, sfox, accounts) {
  let exchange = $scope.vm.external.sfox;
  $scope.enabled = false;
  $scope.openSfoxSignup = () => modals.openSfoxSignup(exchange);

  $scope.stepDescription = () => {
    let stepDescriptions = {
      'verify': { text: 'Verify Identity', i: 'ti-id-badge' },
      'link': { text: 'Link Payment', i: 'ti-credit-card bank bank-lrg' }
    };
    let step = sfox.determineStep(exchange, accounts);
    return stepDescriptions[step];
  };

  if (!exchange.profile || !accounts.length) return;

  $scope.inspectTrade = modals.openTradeSummary;
  $scope.signupCompleted = accounts[0].status === 'active';

  $scope.format = currency.formatCurrencyForView;
  $scope.formatSatoshi = currency.convertFromSatoshi;
  $scope.dollars = currency.currencies.filter(c => c.code === 'USD')[0];
  $scope.bitcoin = currency.bitCurrencies.filter(c => c.code === 'BTC')[0];
  $scope.hasMultipleAccounts = Wallet.accounts().filter(a => a.active).length > 1;
  $scope.btcAccount = Wallet.getDefaultAccount();

  $scope.account = accounts[0];
  $scope.trades = exchange.trades;
  $scope.max = exchange.profile.limits.buy;

  let state = $scope.state = {
    fiat: null,
    btc: null,
    baseCurr: $scope.dollars,
    get quoteCurr () { return this.baseFiat ? $scope.bitcoin : $scope.dollars; },
    get baseFiat () { return this.baseCurr === $scope.dollars; },
    get total () { return this.fiat; }
  };

  $scope.enableBuy = () => $scope.enabled = true;
  $scope.disableBuy = () => $scope.enabled = false;

  $scope.buy = () => {
    $scope.lock();
    $q.resolve($scope.quote.getPaymentMediums())
      .then(mediums => mediums.ach.buy($scope.account))
      .then(trade => { modals.openTradeSummary(trade, 'initiated'); })
      .catch(() => { Alerts.displayError('Error connecting to our exchange partner'); })
      .then($scope.refreshQuote)
      .then($scope.disableBuy)
      .finally($scope.free);
  };

  $scope.getQuoteArgs = (state) => [
    state.baseFiat ? (state.fiat * 100) | 0 : state.btc,
    state.baseCurr.code,
    state.quoteCurr.code
  ];

  $scope.cancelRefresh = () => {
    $timeout.cancel($scope.refreshTimeout);
  };

  $scope.refreshQuote = MyWalletHelpers.asyncOnce(() => {
    $scope.cancelRefresh();
    let args = $scope.getQuoteArgs(state);

    let fetchSuccess = (quote) => {
      $scope.quote = quote;
      state.loadFailed = false;
      let timeToExpiration = new Date(quote.expiresAt) - new Date();
      $scope.refreshTimeout = $timeout($scope.refreshQuote, timeToExpiration);
      if (state.baseFiat) state.btc = quote.quoteAmount;
      else state.fiat = quote.quoteAmount / 100;
    };

    $q.resolve(exchange.getBuyQuote(...args))
      .then(fetchSuccess, () => { state.loadFailed = true; });
  }, 500);

  $scope.refreshIfValid = (field) => {
    if (state[field] && $scope.checkoutForm[field].$valid) {
      $scope.quote = null;
      $scope.refreshQuote();
    } else {
      $scope.refreshQuote.cancel();
    }
  };

  $scope.$watch('state.fiat', () => state.baseFiat && $scope.refreshIfValid('fiat'));
  $scope.$watch('state.btc', () => !state.baseFiat && $scope.refreshIfValid('btc'));
  $scope.$watchGroup(['state.fiat', 'state.btc'], () => $scope.disableBuy());
  $scope.$on('$destroy', $scope.cancelRefresh);
  $scope.installLock();
}
