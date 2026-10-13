-- Triggers and stored procedures (business rules). Run after 01_schema.sql.
USE bank_db;

-- =====================================================================
-- PART 2 : TRIGGERS AND PROCEDURES  (business rules)
-- =====================================================================
DELIMITER $$

-- Rules enforced on every posting: positive amount, ACTIVE account,
-- sufficient balance (respecting the account type's minimum balance),
-- and the audit snapshot balance_after.
CREATE TRIGGER trg_txn_before_insert
BEFORE INSERT ON `transaction`
FOR EACH ROW
BEGIN
    DECLARE v_status VARCHAR(10);
    DECLARE v_bal    DECIMAL(15,2);
    DECLARE v_min    DECIMAL(12,2);
    DECLARE v_new    DECIMAL(15,2);

    IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Transaction amount must be positive';
    END IF;

    SELECT a.status, a.balance, t.min_balance
      INTO v_status, v_bal, v_min
      FROM account a JOIN account_type t ON t.type_id = a.type_id
     WHERE a.account_id = NEW.account_id
       FOR UPDATE;

    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account does not exist';
    END IF;
    IF v_status <> 'ACTIVE' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account is not ACTIVE - transaction rejected';
    END IF;

    IF NEW.transaction_type IN ('DEPOSIT','TRANSFER_CREDIT','LOAN_DISBURSEMENT') THEN
        SET v_new = v_bal + NEW.amount;
    ELSE
        SET v_new = v_bal - NEW.amount;
        IF v_new < v_min THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient balance (minimum balance rule)';
        END IF;
    END IF;

    SET NEW.balance_after = v_new;
END$$

CREATE TRIGGER trg_txn_after_insert
AFTER INSERT ON `transaction`
FOR EACH ROW
BEGIN
    UPDATE account SET balance = NEW.balance_after WHERE account_id = NEW.account_id;
END$$

-- Balanced debit/credit: the two legs of a transfer must match exactly
CREATE TRIGGER trg_transfer_before_insert
BEFORE INSERT ON transfer
FOR EACH ROW
BEGIN
    DECLARE d_amt DECIMAL(15,2); DECLARE c_amt DECIMAL(15,2);
    DECLARE d_type VARCHAR(20);  DECLARE c_type VARCHAR(20);
    DECLARE d_acc INT;           DECLARE c_acc INT;

    SELECT amount, transaction_type, account_id INTO d_amt, d_type, d_acc
      FROM `transaction` WHERE transaction_id = NEW.debit_transaction_id;
    SELECT amount, transaction_type, account_id INTO c_amt, c_type, c_acc
      FROM `transaction` WHERE transaction_id = NEW.credit_transaction_id;

    IF d_type <> 'TRANSFER_DEBIT' OR c_type <> 'TRANSFER_CREDIT' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Transfer legs must be a TRANSFER_DEBIT and a TRANSFER_CREDIT';
    END IF;
    IF d_amt <> c_amt THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unbalanced transfer: debit must equal credit';
    END IF;
    IF d_acc = c_acc THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot transfer to the same account';
    END IF;
END$$

-- Atomic transfer: both legs + transfer record commit together or not at all
CREATE PROCEDURE sp_transfer(IN p_from INT, IN p_to INT, IN p_amount DECIMAL(15,2),
                             IN p_remarks VARCHAR(150), IN p_when DATETIME)
BEGIN
    DECLARE v_debit BIGINT; DECLARE v_credit BIGINT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN ROLLBACK; RESIGNAL; END;

    IF p_from = p_to THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot transfer to the same account';
    END IF;
    START TRANSACTION;
        INSERT INTO `transaction`(account_id, transaction_type, amount, transaction_date, description)
        VALUES (p_from, 'TRANSFER_DEBIT', p_amount, COALESCE(p_when, NOW()), CONCAT('Transfer to A/C #', p_to));
        SET v_debit = LAST_INSERT_ID();
        INSERT INTO `transaction`(account_id, transaction_type, amount, transaction_date, description)
        VALUES (p_to, 'TRANSFER_CREDIT', p_amount, COALESCE(p_when, NOW()), CONCAT('Transfer from A/C #', p_from));
        SET v_credit = LAST_INSERT_ID();
        INSERT INTO transfer(debit_transaction_id, credit_transaction_id, remarks)
        VALUES (v_debit, v_credit, p_remarks);
    COMMIT;
END$$

-- Loan repayment: debits the loan account, records the payment and allocates it
CREATE PROCEDURE sp_loan_repayment(IN p_loan INT, IN p_schedule INT,
                                   IN p_amount DECIMAL(15,2), IN p_when DATETIME)
BEGIN
    DECLARE v_acc INT; DECLARE v_status VARCHAR(10); DECLARE v_txn BIGINT;
    DECLARE v_due DECIMAL(15,2); DECLARE v_paid DECIMAL(15,2); DECLARE v_open INT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN ROLLBACK; RESIGNAL; END;

    SELECT account_id, status INTO v_acc, v_status FROM loan WHERE loan_id = p_loan;
    IF v_status IS NULL OR v_status <> 'ACTIVE' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Loan not found or not ACTIVE';
    END IF;
    SELECT due_amount INTO v_due FROM loan_schedule
     WHERE schedule_id = p_schedule AND loan_id = p_loan;
    IF v_due IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Schedule item does not belong to this loan';
    END IF;

    START TRANSACTION;
        INSERT INTO `transaction`(account_id, transaction_type, amount, transaction_date, description)
        VALUES (v_acc, 'LOAN_REPAYMENT', p_amount, COALESCE(p_when, NOW()), CONCAT('EMI for loan #', p_loan));
        SET v_txn = LAST_INSERT_ID();
        INSERT INTO loan_repayment(transaction_id, loan_id) VALUES (v_txn, p_loan);
        INSERT INTO repayment(schedule_id, transaction_id, amount) VALUES (p_schedule, v_txn, p_amount);

        SELECT COALESCE(SUM(amount),0) INTO v_paid FROM repayment
         WHERE schedule_id = p_schedule AND status = 'APPLIED';
        IF v_paid >= v_due THEN
            UPDATE loan_schedule SET status = 'PAID' WHERE schedule_id = p_schedule;
        END IF;
        SELECT COUNT(*) INTO v_open FROM loan_schedule WHERE loan_id = p_loan AND status <> 'PAID';
        IF v_open = 0 THEN
            UPDATE loan SET status = 'CLOSED' WHERE loan_id = p_loan;
        END IF;
    COMMIT;
END$$

DELIMITER ;

