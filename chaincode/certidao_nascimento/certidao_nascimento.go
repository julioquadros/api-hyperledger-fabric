package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strconv"

	"github.com/hyperledger/fabric/core/chaincode/shim"
	sc "github.com/hyperledger/fabric/protos/peer"
)

type SmartContract struct {
}

type Person struct {
	PersonID         string `json:"personId"`
	PersonFirstName  string `json:"personName"`
	PersonMiddleName string `json:"personMiddleName"`
	PersonLastName   string `json:"personLastName"`
}

func (s *SmartContract) Init(APIstub shim.ChaincodeStubInterface) sc.Response {
	return shim.Success(nil)
}

func (s *SmartContract) Invoke(APIstub shim.ChaincodeStubInterface) sc.Response {

	function, args := APIstub.GetFunctionAndParameters()
	if function == "queryPerson" {
		return s.queryPerson(APIstub, args)
	} else if function == "initLedger" {
		return s.initLedger(APIstub)
	} else if function == "createPerson" {
		return s.createPerson(APIstub, args)
	} else if function == "queryAllPeople" {
		return s.queryAllPeople(APIstub)
	}

	return shim.Error("Invalid Smart Contract function name.")
}

func (s *SmartContract) queryPerson(APIstub shim.ChaincodeStubInterface, args []string) sc.Response {

	if len(args) != 1 {
		return shim.Error("Incorrect number of arguments. Expecting 1")
	}

	personIDAsBytes, _ := APIstub.GetState(args[0])
	return shim.Success(personIDAsBytes)
}

func (s *SmartContract) initLedger(APIstub shim.ChaincodeStubInterface) sc.Response {
	people := []Person{
		Person{PersonID: "0000000001", PersonFirstName: "Julio", PersonMiddleName: "Sergio", PersonLastName: "Quadros dos Santos"},
		Person{PersonID: "0000000002", PersonFirstName: "Andrea", PersonMiddleName: "", PersonLastName: "Silva dos Santos"},
		Person{PersonID: "0000000003", PersonFirstName: "Maria", PersonMiddleName: "Adelia", PersonLastName: "de Quadros"},
		Person{PersonID: "0000000004", PersonFirstName: "Guilherme", PersonMiddleName: "", PersonLastName: "Quadros dos Santos"},
		Person{PersonID: "0000000005", PersonFirstName: "Ana", PersonMiddleName: "Gabriela", PersonLastName: "Oliveira"},
		Person{PersonID: "0000000006", PersonFirstName: "Joao", PersonMiddleName: "Rafael", PersonLastName: "de Souza"},
		Person{PersonID: "0000000007", PersonFirstName: "Antonio", PersonMiddleName: "Daniel", PersonLastName: "Lima"},
		Person{PersonID: "0000000008", PersonFirstName: "Francisco", PersonMiddleName: "Marcelo", PersonLastName: "Pereira"},
		Person{PersonID: "0000000009", PersonFirstName: "Carlos", PersonMiddleName: "Bruno", PersonLastName: "Ferreira"},
		Person{PersonID: "0000000010", PersonFirstName: "Paulo", PersonMiddleName: "Eduardo", PersonLastName: "Costa"},
		Person{PersonID: "0000000011", PersonFirstName: "Pedro", PersonMiddleName: "Carlos", PersonLastName: "Alves"},
		Person{PersonID: "0000000012", PersonFirstName: "Lucas", PersonMiddleName: "Jose", PersonLastName: "Nascimento"},
		Person{PersonID: "0000000013", PersonFirstName: "Luiz", PersonMiddleName: "Antonio", PersonLastName: "Ribeiro"},
	}

	i := 0
	for i < len(people) {
		fmt.Println("i is ", i)
		personIDAsBytes, _ := json.Marshal(people[i])
		APIstub.PutState("PERSON"+strconv.Itoa(i), personIDAsBytes)
		fmt.Println("Added", people[i])
		i = i + 1
	}

	return shim.Success(nil)
}

func (s *SmartContract) createPerson(APIstub shim.ChaincodeStubInterface, args []string) sc.Response {

	if len(args) != 5 {
		return shim.Error("Incorrect number of arguments. Expecting 5")
	}

	var person = Person{PersonID: args[1], PersonFirstName: args[2], PersonMiddleName: args[3], PersonLastName: args[4]}

	personIDAsBytes, _ := json.Marshal(person)
	APIstub.PutState(args[0], personIDAsBytes)

	return shim.Success(nil)
}

func (s *SmartContract) queryAllPeople(APIstub shim.ChaincodeStubInterface) sc.Response {

	startKey := "PERSON0"
	endKey := "PERSON99999"

	resultsIterator, err := APIstub.GetStateByRange(startKey, endKey)
	if err != nil {
		return shim.Error(err.Error())
	}
	defer resultsIterator.Close()

	var buffer bytes.Buffer
	buffer.WriteString("[")

	bArrayMemberAlreadyWritten := false
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return shim.Error(err.Error())
		}
		if bArrayMemberAlreadyWritten == true {
			buffer.WriteString(",")
		}
		buffer.WriteString("{\"Key\":")
		buffer.WriteString("\"")
		buffer.WriteString(queryResponse.Key)
		buffer.WriteString("\"")

		buffer.WriteString(", \"Record\":")
		buffer.WriteString(string(queryResponse.Value))
		buffer.WriteString("}")
		bArrayMemberAlreadyWritten = true
	}
	buffer.WriteString("]")

	fmt.Printf("- queryAllPeople:\n%s\n", buffer.String())

	return shim.Success(buffer.Bytes())
}

func main() {

	err := shim.Start(new(SmartContract))
	if err != nil {
		fmt.Printf("Error creating new Smart Contract: %s", err)
	}
}
